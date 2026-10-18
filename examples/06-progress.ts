import { createApiary, MemoryQueueStore, Worker } from '@newfoundcodes/helvetium-apiary';
import { logJobLifecycle } from './_logging.ts';

const apiary = createApiary({ store: new MemoryQueueStore() });
const stopLogging = logJobLifecycle(apiary, 'progress');

apiary.define('import', async (rows: string[], ctx) => {
  for (let i = 0; i < rows.length; i++) {
    await ctx.updateProgress({ processed: i + 1, total: rows.length });
  }

  return { imported: rows.length };
});

const job = await apiary.add('import', ['a', 'b', 'c']);
console.log(`[queued] import job ${job.id}`);

const worker = new Worker(apiary, { id: 'progress-worker' });
try {
  console.log(`[worker] claimed=${await worker.runOnce()}`);
  console.log('[result]', await apiary.waitUntilFinished(job.id));
  console.log('[worker stats]', worker.stats);
} finally {
  stopLogging();
  await apiary.close();
}
