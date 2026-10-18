import { createApiary, MemoryQueueStore, Worker } from '@newfoundcodes/helvetium-apiary';
import { logJobLifecycle } from './_logging.ts';

const apiary = createApiary({ store: new MemoryQueueStore() });
const stopLogging = logJobLifecycle(apiary, 'tenant');

apiary.define('invoice', async (payload: { tenant: string }) => {
  console.log(`[handler] invoicing tenant=${payload.tenant}`);
  return { tenant: payload.tenant, invoiced: true };
});

const jobs = await Promise.all(
  ['acme', 'globex'].map((tenant) =>
    apiary.add(
      'invoice',
      { tenant },
      {
        queue: `tenant:${tenant}`,
        tags: ['billing', tenant],
        uniqueKey: `monthly-invoice:${tenant}:2026-09`,
      },
    ),
  ),
);

console.log(
  '[tenants] queued',
  jobs.map((job) => ({ id: job.id, queue: job.queue })),
);

const worker = new Worker(apiary, {
  id: 'tenant-worker',
  queues: ['tenant:acme', 'tenant:globex'],
  pollInterval: 10,
});
void worker.start();

try {
  await Promise.all(jobs.map((job) => apiary.waitUntilFinished(job.id)));

  console.log('[tenant stats]', await Promise.all(jobs.map((job) => apiary.stats(job.queue))));
  console.log('[worker stats]', worker.stats);
} finally {
  stopLogging();
  await worker.stop();
}
