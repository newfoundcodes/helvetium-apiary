import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createApiary,
  MemoryQueueStore,
  Worker,
  DuplicateJobError,
  enqueueChain,
  enqueueWorkflow,
} from '../dist/index.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitState(apiary, id, states, timeout = 1000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const job = await apiary.get(id);
    if (job && states.includes(job.state)) {
      return job;
    }

    await sleep(5);
  }

  throw new Error(`Timed out waiting for ${states.join(',')}`);
}

async function run(apiary, worker, job) {
  await worker.runOnce();
  return waitState(apiary, job.id, ['completed', 'failed', 'dead', 'cancelled']);
}

function fixture(clock) {
  return createApiary({ store: new MemoryQueueStore(), clock });
}

test('enqueue creates waiting job', async () => {
  const a = fixture();
  const j = await a.add('x', { a: 1 });

  assert.equal(j.state, 'waiting');
  assert.equal(j.queue, 'default');
});

test('delay creates scheduled job', async () => {
  let now = 1000;
  const a = fixture(() => now);
  const j = await a.add('x', {}, { delay: 500 });

  assert.equal(j.state, 'scheduled');
  assert.equal(j.runAt, 1500);
});

test('priority claim wins over creation order', async () => {
  let now = 1;
  const a = fixture(() => now);
  const low = await a.add('x', {}, { priority: 1 });
  now++;

  const high = await a.add('x', {}, { priority: 10 });
  const c = await a.store.claim({ queue: 'default', workerId: 'w', now, limit: 1, leaseMs: 1000 });

  assert.equal(c[0].id, high.id);
  assert.notEqual(c[0].id, low.id);
});

test('fifo claim uses creation order', async () => {
  let now = 1;
  const a = fixture(() => now);
  const one = await a.add('x', {});

  now++;
  await a.add('x', {});

  const c = await a.store.claim({
    queue: 'default',
    workerId: 'w',
    now,
    limit: 1,
    leaseMs: 1000,
    order: 'fifo',
  });

  assert.equal(c[0].id, one.id);
});

test('lifo claim uses reverse creation order', async () => {
  let now = 1;
  const a = fixture(() => now);

  await a.add('x', {});
  now++;

  const two = await a.add('x', {});
  const c = await a.store.claim({
    queue: 'default',
    workerId: 'w',
    now,
    limit: 1,
    leaseMs: 1000,
    order: 'lifo',
  });

  assert.equal(c[0].id, two.id);
});

test('dedupe returns existing job', async () => {
  const a = fixture();
  const one = await a.add('x', { v: 1 }, { dedupeKey: 'a' });
  const two = await a.add('x', { v: 2 }, { dedupeKey: 'a' });

  assert.equal(two.id, one.id);
});

test('unique key rejects duplicate', async () => {
  const a = fixture();

  await a.add('x', {}, { uniqueKey: 'one' });
  await assert.rejects(() => a.add('x', {}, { uniqueKey: 'one' }), DuplicateJobError);
});

test('bulk enqueues many jobs', async () => {
  const a = fixture();
  const jobs = await a.bulk([
    { name: 'a', payload: 1 },
    { name: 'b', payload: 2 },
  ]);

  assert.equal(jobs.length, 2);
  assert.equal((await a.stats()).total, 2);
});

test('queue pause prevents worker claim', async () => {
  const a = fixture();
  a.define('x', () => 1);

  const j = await a.add('x', {});
  a.pause();

  const w = new Worker(a);
  assert.equal(await w.runOnce(), 0);
  assert.equal((await a.get(j.id)).state, 'waiting');
});

test('cancelling waiting job is terminal', async () => {
  const a = fixture();
  const j = await a.add('x', {});

  assert.equal(await a.cancel(j.id), true);
  assert.equal((await a.get(j.id)).state, 'cancelled');
});

test('worker completes registered job', async () => {
  const a = fixture();
  a.define('sum', ({ a, b }) => a + b);

  const j = await a.add('sum', { a: 2, b: 3 });
  const done = await run(a, new Worker(a), j);

  assert.equal(done.result, 5);
  assert.equal(done.state, 'completed');
});

test('worker writes progress', async () => {
  const a = fixture();
  let progress;

  a.events.on('job:progress', (j) => {
    progress = j.progress;
  });

  a.define('x', async (_, c) => {
    await c.updateProgress(42);
    return true;
  });

  const j = await a.add('x', {});
  await run(a, new Worker(a), j);

  assert.equal(progress, 42);
});

test('unknown handler fails when attempts exhausted', async () => {
  const a = fixture();
  const j = await a.add('missing', {}, { maxAttempts: 1 });
  const done = await run(a, new Worker(a), j);

  assert.equal(done.state, 'failed');
  assert.match(done.error.message, /No handler/);
});

test('retry schedules another attempt with backoff', async () => {
  const a = fixture();
  let calls = 0;

  a.define('x', () => {
    calls++;
    throw new Error('boom');
  });

  const j = await a.add('x', {}, { maxAttempts: 2, backoff: 25 });
  const w = new Worker(a);
  await w.runOnce();

  const retrying = await waitState(a, j.id, ['scheduled']);
  assert.equal(retrying.attempt, 1);
  assert.ok(retrying.runAt >= retrying.updatedAt);
  assert.equal(calls, 1);
});

test('successful retry reaches completed', async () => {
  const a = fixture();
  let calls = 0;

  a.define('x', () => {
    if (++calls === 1) {
      throw new Error('first');
    }

    return 'ok';
  });

  const j = await a.add('x', {}, { maxAttempts: 2, backoff: 0 });
  const w = new Worker(a);

  await w.runOnce();
  await waitState(a, j.id, ['waiting']);
  await w.runOnce();

  const done = await waitState(a, j.id, ['completed']);
  assert.equal(done.result, 'ok');
  assert.equal(done.attempt, 2);
});

test('job timeout fails terminal attempt', async () => {
  const a = fixture();
  a.define('slow', () => new Promise((r) => setTimeout(() => r('late'), 100)));

  const j = await a.add('slow', {}, { maxAttempts: 1, timeout: 10 });
  const done = await run(a, new Worker(a), j);

  assert.equal(done.state, 'failed');
  assert.match(done.error.message, /timed out/);
});

test('dead letter creates inspection job', async () => {
  const a = fixture();
  a.define('bad', () => {
    throw new Error('no');
  });

  const j = await a.add('bad', { x: 1 }, { maxAttempts: 1, deadLetterQueue: 'dead' });
  const done = await run(a, new Worker(a), j);
  assert.equal(done.state, 'dead');

  const dlq = await a.list({ queue: 'dead' });
  assert.equal(dlq.length, 1);
  assert.equal(dlq[0].name, '__apiary:dead-letter');
  assert.equal(dlq[0].payload.originalJob.id, j.id);
});

test('worker rate limiter reschedules without consuming attempt', async () => {
  let now = 1000;

  const a = fixture(() => now);
  a.define('x', () => true);

  const j1 = await a.add('x', {});
  const j2 = await a.add('x', {});
  const w = new Worker(a, { concurrency: 2, rateLimit: { max: 1, windowMs: 1000 } });
  await w.runOnce();

  const terminal = await waitState(a, j1.id, ['completed', 'scheduled']);
  const other = await waitState(a, j2.id, ['completed', 'scheduled']);
  const scheduled = [terminal, other].find((j) => j.state === 'scheduled');

  assert.ok(scheduled);
  assert.equal(scheduled.attempt, 0);
});

test('stats counts terminal states', async () => {
  const a = fixture();
  a.define('ok', () => 1);

  const j = await a.add('ok', {});
  await run(a, new Worker(a), j);

  const s = await a.stats();
  assert.equal(s.completed, 1);
  assert.equal(s.total, 1);
});

test('list filters by tag', async () => {
  const a = fixture();
  await a.add('x', {}, { tags: ['mail', 'urgent'] });
  await a.add('x', {}, { tags: ['mail'] });

  assert.equal((await a.list({ tags: ['urgent'] })).length, 1);
});

test('expired active lease can be reclaimed', async () => {
  let now = 100;
  const a = fixture(() => now);
  const j = await a.add('x', {});

  await a.store.claim({ queue: 'default', workerId: 'a', now, limit: 1, leaseMs: 10 });
  now = 111;

  const claim = await a.store.claim({
    queue: 'default',
    workerId: 'b',
    now,
    limit: 1,
    leaseMs: 10,
  });

  assert.equal(claim[0].id, j.id);
  assert.equal(claim[0].lockedBy, 'b');
});

test('chain stores durable dependency IDs', async () => {
  const a = fixture();
  const batch = await enqueueChain(a, [
    { name: 'a', payload: {} },
    { name: 'b', payload: {} },
  ]);

  const jobs = await Promise.all(batch.jobIds.map((id) => a.get(id)));
  assert.deepEqual(jobs[1].dependsOn, [jobs[0].id]);
});

test('workflow DAG resolves named dependencies', async () => {
  const a = fixture();
  const r = await enqueueWorkflow(a, {
    nodes: [
      { id: 'a', name: 'x', payload: 1 },
      { id: 'b', name: 'x', payload: 2, dependsOn: ['a'] },
    ],
  });

  const jobs = await Promise.all(r.jobIds.map((id) => a.get(id)));
  assert.equal(jobs[1].dependsOn[0], jobs[0].id);
});

test('dependency blocks claim until parent completes', async () => {
  const a = fixture();
  a.define('x', () => true);

  const parent = await a.add('x', {});
  const child = await a.add('x', {}, { dependsOn: [parent.id] });

  const claim = await a.store.claim({
    queue: 'default',
    workerId: 'w',
    now: a.now(),
    limit: 2,
    leaseMs: 1000,
  });

  assert.deepEqual(
    claim.map((j) => j.id),
    [parent.id],
  );
  assert.equal((await a.get(child.id)).state, 'waiting');
});
