import { createApiary, MemoryQueueStore, Worker } from '@newfoundcodes/helvetium-apiary';
import { logJobLifecycle } from './_logging.ts';

const apiary = createApiary({ store: new MemoryQueueStore() });
const stopLogging = logJobLifecycle(apiary, 'concurrency');

apiary.define('resize', async (p: { url: string }, context) => {
  console.log(`[handler] attempt=${context.attempt} resizing ${p.url}`);

  await new Promise((resolve) => setTimeout(resolve, 10));
  return p.url;
});

const jobs = [];
for (let i = 0; i < 100; i++) {
  jobs.push(await apiary.add('resize', { url: `https://cdn.test/${i}.jpg` }));
}

const worker = new Worker(apiary, { concurrency: 16, queues: ['default'], pollInterval: 25 });
void worker.start();

try {
  await Promise.all(jobs.map((job) => apiary.waitUntilFinished(job.id)));

  console.log(`[result] processed ${jobs.length} jobs with concurrency ${16}`);
  console.log('[worker stats]', worker.stats);
} finally {
  stopLogging();
  await worker.stop();
}
