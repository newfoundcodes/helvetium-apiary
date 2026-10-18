import { createApiary, MemoryQueueStore } from '@newfoundcodes/helvetium-apiary';
import { createApiaryDaemon } from '@newfoundcodes/helvetium-apiary/node';
import { logJobLifecycle } from './_logging.ts';

const apiary = createApiary({ store: new MemoryQueueStore() });
const stopLogging = logJobLifecycle(apiary, 'daemon');
apiary.define('work', async (payload: { id: number }) => {
  console.log(`[handler] daemon processed job ${payload.id}`);
  return payload.id;
});

const jobs = await Promise.all([
  apiary.add('work', { id: 1 }, { queue: 'critical' }),
  apiary.add('work', { id: 2 }, { queue: 'critical' }),
  apiary.add('work', { id: 3 }),
  apiary.add('work', { id: 4 }),
]);

const daemon = createApiaryDaemon(apiary, {
  workers: [
    { queues: ['critical'], count: 1, concurrency: 2 },
    { queues: ['default'], count: 1, concurrency: 2 },
  ],
  scheduler: false,
});

await daemon.start();
console.log(`[daemon] started workers=${daemon.workers.length}`);

try {
  await Promise.all(jobs.map((job) => apiary.waitUntilFinished(job.id)));

  console.log('[daemon] all jobs completed');
  console.log(
    '[worker stats]',
    daemon.workers.map((worker) => worker.stats),
  );
} finally {
  stopLogging();
  await daemon.stop();

  console.log('[daemon] stopped');
}
