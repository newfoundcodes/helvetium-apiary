import { createApiary, MemoryQueueStore, Worker } from '@newfoundcodes/helvetium-apiary';
import { logJobLifecycle } from './_logging.ts';

const apiary = createApiary({ store: new MemoryQueueStore() });
const stopLogging = logJobLifecycle(apiary, 'multi-queue');

apiary.define('task', async (payload: { queue: string; id: number }) => {
  console.log(`[handler] ${payload.queue} task=${payload.id}`);
  return payload;
});

const jobs = await Promise.all(
  ['critical', 'default', 'bulk'].map((queue, id) =>
    apiary.add('task', { queue, id }, { queue, priority: queue === 'critical' ? 100 : 1 }),
  ),
);

const worker = new Worker(apiary, {
  id: 'multi-queue-worker',
  queues: ['critical', 'default', 'bulk'],
  concurrency: 12,
  order: 'priority',
  pollInterval: 10,
});
void worker.start();

try {
  await Promise.all(jobs.map((job) => apiary.waitUntilFinished(job.id)));

  console.log(
    '[queues]',
    await Promise.all(['critical', 'default', 'bulk'].map((q) => apiary.stats(q))),
  );
  console.log('[worker stats]', worker.stats);
} finally {
  stopLogging();
  await worker.stop();
}
