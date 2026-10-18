<div align="center">
  <img src="https://github.com/newfoundcodes/newfoundcodes-logo/blob/main/newfoundcodes-helvetium.png?raw=true" width="128" />
  <h1>Helvetium Apiary</h1>
  <p>
    <a href="https://github.com/newfoundcodes/helvetium-apiary/actions"><img src="https://github.com/newfoundcodes/helvetium-apiary/actions/workflows/ci.yml/badge.svg" alt="Build Status"></a>
  </p>
</div>

A TypeScript runtime for durable background work: jobs, queues, cron and interval schedules, worker pools, retries, dead-letter handling, workflows, notifications, atomic coordination, observability, and Helvetium Boot integration.

Apiary stores **data and handler names**, not executable code. Applications register trusted handlers at startup, enqueue serializable payloads, and let workers claim jobs through a storage adapter. This separation makes process restarts and horizontal workers possible without serializing functions.

## Installation

```bash
npm install @newfoundcodes/helvetium-apiary
```

Node.js 20 or newer is required for the Node-specific file store and daemon helpers. The core job model is written against standard TypeScript/JavaScript APIs plus the `QueueStore` abstraction.

## Quick start

```ts
import { createApiary, MemoryQueueStore, Worker } from '@newfoundcodes/helvetium-apiary';

const apiary = createApiary({
  store: new MemoryQueueStore(),
});

apiary.define(
  'send-welcome-email',
  async ({ email }: { email: string }, context) => {
    context.log('Sending welcome email', { email });
    await context.updateProgress(50);
    // send the email
    await context.updateProgress(100);
    return { delivered: true };
  },
  {
    maxAttempts: 5,
    backoff: {
      type: 'exponential',
      delay: 500,
      factor: 2,
      maxDelay: 30_000,
      jitter: 0.2,
    },
  },
);

const job = await apiary.add(
  'send-welcome-email',
  { email: 'user@example.com' },
  {
    queue: 'mail',
    priority: 10,
    dedupeKey: 'welcome:user@example.com',
    dedupeTTL: 60_000,
  },
);

const worker = new Worker(apiary, {
  queues: ['mail'],
  concurrency: 8,
  pollInterval: 50,
});

await worker.start();
const result = await apiary.waitUntilFinished(job.id);
console.log(result);
```

## Job lifecycle

Jobs use explicit durable states:

```text
                 delay / future runAt
                        │
                        ▼
                    scheduled
                        │ due
                        ▼
waiting ─────────────► active ─────────────► completed
  ▲                      │
  │                      │ failure
  │ retry/backoff        ▼
  └───────────────── scheduled
                         │ attempts exhausted
                         ├────────► failed
                         └────────► dead + dead-letter record

waiting/scheduled/active ── cancellation ──► cancelled
```

An `active` job is owned by a worker only for the duration of its **lease**. Workers heartbeat the lease while the handler runs. If a process dies and the lease expires, a compatible store can make the job claimable by another worker. Storage adapters must implement claiming, heartbeat, scheduling, locking, and counters atomically for distributed correctness.

## Delivery semantics

Apiary is designed around **at-least-once execution** for durable distributed stores. A worker can finish an external side effect and crash before recording `completed`. The job may later run again. Handlers that modify external state should therefore be idempotent or use an idempotency key derived from the job ID, business operation ID, or `dedupeKey`.

`dedupeKey` reduces duplicate enqueues during a time window. `uniqueKey` rejects a second live job for the same uniqueness window. Neither mechanism can make an arbitrary external side effect exactly-once.

## Retries and backoff

A job can use a constant delay:

```ts
await apiary.add('sync-customer', payload, {
  maxAttempts: 5,
  backoff: 2000,
});
```

or a strategy:

```ts
await apiary.add('sync-customer', payload, {
  maxAttempts: 8,
  backoff: {
    type: 'exponential',
    delay: 500,
    factor: 2,
    maxDelay: 60_000,
    jitter: 0.25,
  },
});
```

Supported strategies are `fixed`, `linear`, and `exponential`. Jitter spreads retries so a large outage does not cause every failed job to retry at the same instant.

## Worker leases, heartbeats, and timeouts

Workers claim jobs for `leaseMs`. A heartbeat extends that lease. Job handlers receive an `AbortSignal`, a manual `heartbeat()` method, progress methods, and cancellation helpers.

```ts
apiary.define('long-import', async (rows: string[], context) => {
  for (let index = 0; index < rows.length; index++) {
    context.signal.throwIfAborted();
    await importRow(rows[index]);
    await context.updateProgress({
      processed: index + 1,
      total: rows.length,
    });
  }
});
```

`timeout` aborts a job execution after the configured period. Cancellation is cooperative: user code must observe the supplied signal or call `throwIfCancelled()` during long work.

## Cron and schedules

Apiary supports five-field POSIX-style cron expressions, an extended six-field form with seconds, and common aliases such as `@hourly`, `@daily`, and `@weekly`.

```ts
import { Scheduler } from '@newfoundcodes/helvetium-apiary';

const scheduler = new Scheduler(apiary);

await scheduler.add({
  id: 'weekday-report',
  name: 'generate-report',
  payload: { scope: 'daily' },
  cron: '0 8 * * mon-fri',
  timezone: 'Asia/Manila',
  overlap: 'skip',
  misfire: 'fire-once',
});
```

Schedules can also use `every` for fixed intervals or `at` for one-shot execution. Misfire policies are `skip`, `fire-once`, and `catch-up`. Overlap policies are `allow`, `skip`, and `queue-one`.

A scheduler acquires the shared `apiary:scheduler:tick` lease before evaluating schedules. Distributed stores must make this lock atomic so multiple scheduler processes do not independently enqueue the same occurrence. Each occurrence also receives a deterministic schedule dedupe key as a second defense.

## Queues

Named queues isolate classes of work:

```ts
import { createQueue } from '@newfoundcodes/helvetium-apiary';

const critical = createQueue(apiary, 'critical');
const bulk = createQueue(apiary, 'bulk');

await critical.add('charge-card', payment);
await bulk.add('rebuild-search-index', {});

bulk.pause();
bulk.resume();
```

Workers can consume one or more queues. `priority` ordering sorts by descending numeric priority and then due/creation time. FIFO and LIFO are also available.

## Deduplication and uniqueness

```ts
await apiary.add('receive-webhook', event, {
  dedupeKey: `stripe:${event.id}`,
  dedupeTTL: 24 * 60 * 60 * 1000,
});
```

A repeated dedupe key returns the existing job while the dedupe window remains active.

```ts
await apiary.add(
  'tenant-reindex',
  { tenantId },
  {
    uniqueKey: `tenant-reindex:${tenantId}`,
    uniqueTTL: 30 * 60 * 1000,
  },
);
```

A repeated unique key throws `DuplicateJobError` while the unique window remains active.

## Dead-letter queues

```ts
await apiary.add('deliver-webhook', payload, {
  maxAttempts: 8,
  deadLetterQueue: 'dead-letter',
});
```

After all attempts fail, the original job enters `dead`. Apiary writes a `__apiary:dead-letter` inspection record to the configured dead-letter queue containing the original job and terminal error. A dead-letter queue should normally be inspected, alerted, or handled by an explicit application job rather than consumed as if it were the original operation.

## Workflows

### Batch

```ts
const batch = await enqueueBatch(
  apiary,
  records.map((record) => ({
    name: 'process-record',
    payload: record,
  })),
);
```

### Chain

```ts
await enqueueChain(apiary, [
  { name: 'validate-order', payload: order },
  { name: 'charge-order', payload: order },
  { name: 'fulfill-order', payload: order },
]);
```

Each later chain job stores the previous job ID in `dependsOn`. A compatible store only claims a dependent job after its dependency has reached the required state.

### DAG

```ts
await enqueueWorkflow(apiary, {
  id: 'release-42',
  nodes: [
    { id: 'build', name: 'build', payload: {} },
    { id: 'test', name: 'test', payload: {}, dependsOn: ['build'] },
    { id: 'deploy', name: 'deploy', payload: {}, dependsOn: ['test'] },
  ],
});
```

Apiary validates the declared graph while enqueuing. Cycles and unknown node dependencies are rejected.

## Notifications

Notification channels implement one method:

```ts
interface NotificationChannel {
  readonly name: string;
  send(notification: Notification): Promise<void> | void;
}
```

Built-in channels include memory, console, and webhook delivery. `NotificationCenter.enqueue()` turns notification delivery into a retryable background job.

## Atomic coordination

Apiary uses cooperative storage-backed primitives:

- `Mutex` — exclusive lock with TTL.
- `Lease` — renewable ownership with a fencing token.
- `Semaphore` — fixed permit count using lock slots.
- `AtomicCounter` — storage-backed increment/decrement.
- `LeaderElector` — cooperative leadership lease.
- `Barrier` — process-local synchronization primitive.

Fencing tokens monotonically increase for newly acquired leases. When stale lock owners could still write to an external system, include the token in that system's write protocol and reject writes from lower tokens.

## Storage abstraction

The required store contract includes job persistence, atomic claiming, heartbeats, schedules, cooperative locks, and counters. The project ships:

- `MemoryQueueStore` for tests, development, and one-process deployments.
- `FileQueueStore` for durable one-process Node deployments.
- `DelegatingQueueStore` for adapting an external implementation without subclassing Apiary internals.

The file store persists jobs, schedules, and counters through temporary-file + rename snapshots. Its distributed locks are intentionally process-local. Do not use it for multiple worker processes that require distributed claims/locks.

For PostgreSQL, a production adapter can use a transactional claim based on row locking with `FOR UPDATE SKIP LOCKED`, while advisory locks can back named lock operations. For Redis/Valkey, claim and lock mutations should use Lua or another server-side atomic operation. These database-specific algorithms belong in storage adapters rather than in the portable scheduler/worker core.

## Helvetium Boot integration

Apiary exposes a standard Fetch-compatible administration application:

```ts
import { mountApiary } from '@newfoundcodes/helvetium-apiary/boot';

mountApiary(app, '/internal/apiary', apiary, {
  scheduler,
  authorize(request) {
    return request.headers.get('authorization') === `Bearer ${process.env.OPS_TOKEN}`;
  },
});
```

Helvetium Boot mounts it through Boot's public `mount()` API. Routes include health, queue inspection, jobs, enqueue, cancel/retry, and schedules. The admin surface is **not authenticated by default**; production deployments must provide `authorize` or protect the mount with Boot middleware.

## Node daemon

```ts
import { createApiaryDaemon } from '@newfoundcodes/helvetium-apiary/node';

const daemon = createApiaryDaemon(apiary, {
  workers: [
    { queues: ['critical'], count: 2, concurrency: 8 },
    { queues: ['default'], count: 4, concurrency: 4 },
  ],
  scheduler: { tickInterval: 1000 },
  shutdownTimeout: 30_000,
});

await daemon.start();
```

The daemon wires `SIGINT`/`SIGTERM` into scheduler shutdown and graceful worker draining.

## Observability and maintenance

`ApiaryEvents` exposes lifecycle signals such as `job:enqueued`, `job:started`, `job:progress`, `job:completed`, `job:failed`, `job:retrying`, `job:dead`, `job:cancelled`, `schedule:fired`, and notification events.

Maintenance helpers include:

```ts
await retryFailed(apiary, { queue: 'mail', limit: 100 });
await pruneJobs(apiary, { olderThan: 7 * 24 * 60 * 60 * 1000 });
const snapshot = await inspectApiary(apiary, workers, scheduler);
```

## License

This project is licensed under the [AGPL-3.0-only](https://spdx.org/licenses/AGPL-3.0-only.html) License.
