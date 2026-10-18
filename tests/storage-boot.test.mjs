import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createApiary,
  MemoryQueueStore,
  createQueue,
  pruneJobs,
  retryFailed,
  inspectApiary,
  isHealthy,
} from '../dist/index.js';
import { FileQueueStore, DelegatingQueueStore } from '../dist/stores/index.js';
import { createApiaryAdminHandler, mountApiary, apiaryContext } from '../dist/boot.js';

test('queue wrapper scopes jobs to named queue', async () => {
  const a = createApiary({ store: new MemoryQueueStore() });
  const q = createQueue(a, 'email');

  await q.add('send', {});

  assert.equal((await q.stats()).total, 1);
  assert.equal((await q.list())[0].queue, 'email');
});

test('file store persists jobs across instances', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'apiary-'));
  const file = join(dir, 'queue.json');

  try {
    const a = createApiary({ store: new FileQueueStore(file) });
    const j = await a.add('x', { v: 1 });
    await a.close();

    const b = createApiary({ store: new FileQueueStore(file) });
    assert.deepEqual((await b.get(j.id)).payload, { v: 1 });

    await b.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('file store persists schedules', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'apiary-'));
  const file = join(dir, 'queue.json');

  try {
    const store = new FileQueueStore(file);
    await store.putSchedule({
      id: 's',
      name: 'x',
      payload: {},
      every: 1000,
      createdAt: 1,
      updatedAt: 1,
      enabled: true,
    });
    await store.close();

    const next = new FileQueueStore(file);
    assert.equal((await next.getSchedule('s')).id, 's');

    await next.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('delegating store forwards operations', async () => {
  const base = new MemoryQueueStore();
  const d = new DelegatingQueueStore(base, 'custom');
  const a = createApiary({ store: d });

  await a.add('x', {});

  assert.equal((await d.stats()).total, 1);
  assert.equal(d.name, 'custom');
});

test('prune removes old terminal jobs', async () => {
  let now = 1000;
  const a = createApiary({ store: new MemoryQueueStore(), clock: () => now });
  const j = await a.add('x', {});

  j.state = 'completed';
  j.finishedAt = 100;

  await a.store.updateJob(j);

  assert.equal(await pruneJobs(a, { olderThan: 500 }), 1);
  assert.equal(await a.get(j.id), null);
});

test('retryFailed resets terminal jobs', async () => {
  const a = createApiary({ store: new MemoryQueueStore() });
  const j = await a.add('x', {});

  j.state = 'failed';
  j.finishedAt = a.now();

  await a.store.updateJob(j);

  assert.equal(await retryFailed(a), 1);
  assert.equal((await a.get(j.id)).state, 'waiting');
});

test('diagnostics reports queues and workers', async () => {
  const a = createApiary({ store: new MemoryQueueStore() });
  await a.add('x', {}, { queue: 'q' });

  const d = await inspectApiary(a);
  assert.equal(d.queues[0].name, 'q');
  assert.equal(await isHealthy(a), true);
});

test('admin handler health endpoint works', async () => {
  const a = createApiary({ store: new MemoryQueueStore() });
  const h = createApiaryAdminHandler(a);
  const r = await h.fetch(new Request('https://x.test/health'));

  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
});

test('admin handler can enqueue and retrieve job', async () => {
  const a = createApiary({ store: new MemoryQueueStore() });
  const h = createApiaryAdminHandler(a);
  const created = await h.fetch(
    new Request('https://x.test/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'x', payload: { a: 1 } }),
    }),
  );
  assert.equal(created.status, 201);

  const job = await created.json();
  const got = await h.fetch(new Request(`https://x.test/jobs/${job.id}`));
  assert.equal((await got.json()).payload.a, 1);
});

test('admin authorization can reject requests', async () => {
  const a = createApiary({ store: new MemoryQueueStore() });
  const h = createApiaryAdminHandler(a, { authorize: () => false });

  assert.equal((await h.fetch(new Request('https://x.test/health'))).status, 401);
});

test('mountApiary uses Boot mount contract', () => {
  let args;
  const app = {
    mount: (...a) => {
      args = a;
    },
  };

  const a = createApiary({ store: new MemoryQueueStore() });
  assert.equal(mountApiary(app, '/apiary', a), app);
  assert.equal(args[0], '/apiary');
  assert.equal(typeof args[1].fetch, 'function');
  assert.deepEqual(args[2], { stripPrefix: true });
});

test('apiary context middleware injects runtime', async () => {
  const a = createApiary({ store: new MemoryQueueStore() });
  let value;

  const middleware = apiaryContext(a);
  const response = await middleware(
    {
      set: (k, v) => {
        value = [k, v];
      },
    },
    async () => new Response('ok'),
  );
  assert.equal(value[0], 'apiary');
  assert.equal(value[1], a);
  assert.equal(await response.text(), 'ok');
});
