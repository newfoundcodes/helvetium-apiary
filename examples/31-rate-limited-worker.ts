import { createApiary, MemoryQueueStore, Worker } from '@newfoundcodes/helvetium-apiary';
import { logJobLifecycle } from './_logging.ts';

const apiary = createApiary({ store: new MemoryQueueStore() });
const stopLogging = logJobLifecycle(apiary, 'rate-limit');

apiary.define('github', async (payload: { id: number; tenant: string }) => {
  console.log(`[handler] GitHub request id=${payload.id} tenant=${payload.tenant}`);
  return payload.id;
});

const jobs = await Promise.all(
  Array.from({ length: 5 }, (_, id) =>
    apiary.add('github', { id, tenant: 'acme' }, { queue: 'github', metadata: { tenant: 'acme' } }),
  ),
);

const worker = new Worker(apiary, {
  id: 'rate-limit-worker',
  queues: ['github'],
  concurrency: 10,
  pollInterval: 10,
  rateLimit: { max: 2, windowMs: 100, key: (job) => String(job.metadata.tenant ?? 'global') },
});
void worker.start();

try {
  await Promise.all(jobs.map((job) => apiary.waitUntilFinished(job.id)));

  console.log('[rate-limit] all requests completed');
  console.log('[worker stats]', worker.stats);
} finally {
  stopLogging();
  await worker.stop();
}
