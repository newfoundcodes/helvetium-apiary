import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createApiary,
  MemoryQueueStore,
  Mutex,
  Semaphore,
  AtomicCounter,
  Barrier,
  LeaderElector,
  LockUnavailableError,
  NotificationCenter,
  MemoryNotificationChannel,
  WebhookNotificationChannel,
  Worker,
} from '../dist/index.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('mutex acquires and releases lease', async () => {
  const store = new MemoryQueueStore();
  const m = new Mutex(store);
  const l = await m.acquire('x');

  assert.ok(l.fencingToken > 0);
  assert.equal(await l.release(), true);
});

test('mutex tryAcquire returns null when held', async () => {
  const store = new MemoryQueueStore();
  const m = new Mutex(store);
  const l = await m.acquire('x');

  assert.equal(await m.tryAcquire('x'), null);
  await l.release();
});

test('mutex withLock always releases', async () => {
  const store = new MemoryQueueStore();
  const m = new Mutex(store);

  await assert.rejects(() =>
    m.withLock('x', () => {
      throw new Error('boom');
    }),
  );

  const l = await m.acquire('x');
  await l.release();
});

test('lease renewal preserves fencing token', async () => {
  const store = new MemoryQueueStore();
  const m = new Mutex(store);
  const l = await m.acquire('x', { ttl: 1000 });
  const n = await l.renew();

  assert.equal(n.fencingToken, l.fencingToken);
  await n.release();
});

test('fencing token increases for a new owner', async () => {
  const store = new MemoryQueueStore();
  const m = new Mutex(store);
  const a = await m.acquire('x');

  const first = a.fencingToken;
  await a.release();

  const b = await m.acquire('x');
  assert.ok(b.fencingToken > first);

  await b.release();
});

test('semaphore enforces permit count', async () => {
  const store = new MemoryQueueStore();
  const s = new Semaphore(store, 's', 2);
  const a = await s.acquire();
  const b = await s.acquire();

  await assert.rejects(() => s.acquire(), LockUnavailableError);
  await a.release();

  const c = await s.acquire();
  assert.ok(c);

  await b.release();
  await c.release();
});

test('atomic counter increments and decrements', async () => {
  const c = new AtomicCounter(new MemoryQueueStore(), 'n');

  assert.equal(await c.increment(), 1);
  assert.equal(await c.increment(4), 5);
  assert.equal(await c.decrement(2), 3);
  assert.equal(await c.value(), 3);
});

test('barrier releases all parties', async () => {
  const b = new Barrier(2);
  let passed = false;

  const p = b.arriveAndWait().then(() => {
    passed = true;
  });

  await sleep(5);
  assert.equal(passed, false);

  await b.arriveAndWait();
  await p;

  assert.equal(passed, true);
});

test('leader elector elects one holder', async () => {
  const m = new Mutex(new MemoryQueueStore());
  const a = new LeaderElector(m, 'x');
  const b = new LeaderElector(m, 'x');

  assert.equal(await a.campaign(), true);
  assert.equal(await b.campaign(), false);

  await a.resign();
  assert.equal(await b.campaign(), true);
  await b.resign();
});

test('memory notification channel records messages', async () => {
  const c = new NotificationCenter();
  const mem = new MemoryNotificationChannel();

  c.register(mem);
  await c.send('memory', { subject: 'Hi', text: 'there' });

  assert.equal(mem.messages[0].subject, 'Hi');
});

test('notification broadcast returns settled results', async () => {
  const c = new NotificationCenter();
  c.register(new MemoryNotificationChannel('a')).register(new MemoryNotificationChannel('b'));

  const r = await c.broadcast(['a', 'b'], { text: 'x' });
  assert.equal(r.length, 2);
  assert.ok(r.every((x) => x.status === 'fulfilled'));
});

test('webhook channel uses injected fetch', async () => {
  let seen;
  const channel = new WebhookNotificationChannel('https://example.test/hook', {
    fetch: async (url, init) => {
      seen = { url, body: init.body };
      return new Response(null, { status: 204 });
    },
  });
  await channel.send({ text: 'hello' });

  assert.equal(seen.url, 'https://example.test/hook');
  assert.match(seen.body, /hello/);
});

test('queued notification is processed by worker', async () => {
  const a = createApiary({ store: new MemoryQueueStore() });
  const center = new NotificationCenter(a);
  const mem = new MemoryNotificationChannel();
  center.register(mem);

  const job = await center.enqueue('memory', { text: 'queued' }, { maxAttempts: 1 });
  const w = new Worker(a);
  await w.runOnce();

  const done = await a.waitUntilFinished(job.id);
  assert.equal(mem.messages[0].text, 'queued');
  assert.equal(done, undefined);
});
