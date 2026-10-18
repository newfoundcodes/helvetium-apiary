import { createApiary, MemoryQueueStore, Worker } from '@newfoundcodes/helvetium-apiary';
import { logJobLifecycle, sleep } from './_logging.ts';

const apiary = createApiary({ store: new MemoryQueueStore() });
const stopLogging = logJobLifecycle(apiary, 'control');

apiary.define('crawl', async (_, ctx) => {
  for (let i = 0; i < 100; i++) {
    ctx.signal.throwIfAborted();
    await new Promise((r) => setTimeout(r, 10));
  }
});

const timeoutJob = await apiary.add('crawl', {}, { timeout: 50, maxAttempts: 1 });
const cancelledJob = await apiary.add('crawl', {}, { timeout: 500, maxAttempts: 1 });
const worker = new Worker(apiary, { id: 'control-worker', pollInterval: 10 });
void worker.start();

await sleep(25);
console.log(`[action] cancelling ${cancelledJob.id}`);

await apiary.cancel(cancelledJob.id);
try {
  await Promise.allSettled([
    apiary.waitUntilFinished(timeoutJob.id),
    apiary.waitUntilFinished(cancelledJob.id),
  ]);

  console.log('[timeout job]', await apiary.require(timeoutJob.id));
  console.log('[cancelled job]', await apiary.require(cancelledJob.id));
  console.log('[worker stats]', worker.stats);
} finally {
  stopLogging();
  await worker.stop({ graceful: false });
}
