import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createApiary,
  MemoryQueueStore,
  Scheduler,
  parseCron,
  cronMatches,
  nextCronOccurrence,
  CronExpressionError,
} from '../dist/index.js';

function fixture(start = Date.UTC(2026, 0, 1, 0, 0, 0)) {
  let now = start;
  const apiary = createApiary({ store: new MemoryQueueStore(), clock: () => now });
  return {
    apiary,
    get now() {
      return now;
    },
    set now(v) {
      now = v;
    },
  };
}

test('cron parser accepts five fields', () => {
  const p = parseCron('*/5 * * * *');

  assert.equal(p.hasSeconds, false);
  assert.ok(p.minutes.values.has(10));
});

test('cron parser accepts six fields', () => {
  const p = parseCron('*/10 * * * * *');

  assert.equal(p.hasSeconds, true);
  assert.ok(p.seconds.values.has(20));
});

test('cron parser supports month and weekday names', () => {
  const p = parseCron('0 8 * jan mon');

  assert.ok(p.months.values.has(1));
  assert.ok(p.weekdays.values.has(1));
});

test('cron aliases are supported', () => {
  assert.equal(cronMatches('@daily', new Date(Date.UTC(2026, 0, 1, 0, 0, 0)), 'UTC'), true);
});

test('invalid cron expression throws', () =>
  assert.throws(() => parseCron('* * *'), CronExpressionError));

test('next occurrence advances to next matching minute', () => {
  const next = nextCronOccurrence('*/15 * * * *', Date.UTC(2026, 0, 1, 0, 1, 0), 'UTC');
  assert.equal(next.toISOString(), '2026-01-01T00:15:00.000Z');
});

test('POSIX day fields use OR when both restricted', () => {
  const fridayJan2 = new Date(Date.UTC(2026, 0, 2, 4, 30, 0));

  assert.equal(fridayJan2.getUTCDay(), 5);
  assert.equal(cronMatches('30 4 1,15 * 5', fridayJan2, 'UTC'), true);
});

test('one-shot schedule fires once and disables', async () => {
  const f = fixture(1000);
  const s = new Scheduler(f.apiary);

  await s.add({ id: 'one', name: 'x', payload: {}, at: 900, misfire: 'fire-once' });
  assert.equal(await s.tick(1000), 1);

  const record = await s.require('one');
  assert.equal(record.enabled, false);
  assert.equal(record.nextRunAt, undefined);
});

test('skip misfire does not enqueue overdue occurrence', async () => {
  const f = fixture(10_000);
  const s = new Scheduler(f.apiary);
  await s.add({ id: 'e', name: 'x', payload: {}, every: 1000, misfire: 'skip' });

  const r = await s.require('e');
  r.nextRunAt = 1000;

  await f.apiary.store.putSchedule(r);

  assert.equal(await s.tick(10_000), 0);
  assert.ok((await s.require('e')).nextRunAt > 10_000);
});

test('fire-once misfire emits one job', async () => {
  const f = fixture(10_000);
  const s = new Scheduler(f.apiary);
  await s.add({ id: 'e', name: 'x', payload: {}, every: 1000, misfire: 'fire-once' });

  const r = await s.require('e');
  r.nextRunAt = 1000;

  await f.apiary.store.putSchedule(r);

  assert.equal(await s.tick(10_000), 1);
  assert.equal((await f.apiary.list()).length, 1);
});

test('catch-up emits bounded missed jobs', async () => {
  const f = fixture(10_000);
  const s = new Scheduler(f.apiary);
  await s.add({ id: 'e', name: 'x', payload: {}, every: 1000, misfire: 'catch-up', maxCatchUp: 3 });

  const r = await s.require('e');
  r.nextRunAt = 1000;

  await f.apiary.store.putSchedule(r);

  assert.equal(await s.tick(10_000), 3);
  assert.equal((await f.apiary.list()).length, 3);
});

test('scheduler dedupe prevents duplicate occurrence', async () => {
  const f = fixture(1000);
  const s = new Scheduler(f.apiary);
  await s.add({ id: 'e', name: 'x', payload: {}, every: 1000 });

  const r = await s.require('e');
  r.nextRunAt = 1000;

  await f.apiary.store.putSchedule(r);
  assert.equal(await s.tick(1000), 1);

  r.nextRunAt = 1000;
  await f.apiary.store.putSchedule(r);

  assert.equal(await s.tick(1000), 1);
  assert.equal((await f.apiary.list()).length, 1);
});

test('disabled schedule does not fire', async () => {
  const f = fixture(1000);
  const s = new Scheduler(f.apiary);

  await s.add({ id: 'x', name: 'x', payload: {}, at: 1000, enabled: false });
  assert.equal(await s.tick(1000), 0);
});

test('schedule enable and disable mutate persisted state', async () => {
  const f = fixture(1000);
  const s = new Scheduler(f.apiary);

  await s.add({ id: 'x', name: 'x', payload: {}, every: 1000 });
  await s.disable('x');
  assert.equal((await s.require('x')).enabled, false);

  await s.enable('x');
  assert.equal((await s.require('x')).enabled, true);
});

test('global scheduler lease prevents duplicate leaders', async () => {
  const f = fixture(1000);
  const lock = await f.apiary.store.acquireLock('apiary:scheduler:tick', 'other', 1000, 1000);

  const s = new Scheduler(f.apiary, { id: 'mine' });
  await s.add({ id: 'x', name: 'x', payload: {}, at: 1000 });

  assert.equal(await s.tick(1000), 0);
  await f.apiary.store.releaseLock(lock.key, lock.owner, lock.token);
});
