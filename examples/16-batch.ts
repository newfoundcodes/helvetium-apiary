import {
  createApiary,
  MemoryQueueStore,
  Worker,
  enqueueBatch,
  batchStatus,
} from '@newfoundcodes/helvetium-apiary';
import { logJobLifecycle } from './_logging.ts';

const apiary = createApiary({ store: new MemoryQueueStore() });
const stopLogging = logJobLifecycle(apiary, 'batch');

apiary.define('thumbnail', async (payload: { id: number }) => {
  console.log(`[handler] generating thumbnail ${payload.id}`);
  return { id: payload.id, ready: true };
});

const batch = await enqueueBatch(
  apiary,
  [1, 2, 3].map((id) => ({ name: 'thumbnail', payload: { id } })),
);

console.log('[batch queued]', batch);
console.log('[batch pending]', await batchStatus(apiary, batch.id));

const worker = new Worker(apiary, { id: 'batch-worker', pollInterval: 10 });
void worker.start();

try {
  await Promise.all(batch.jobIds.map((id) => apiary.waitUntilFinished(id)));

  console.log('[batch complete]', await batchStatus(apiary, batch.id));
  console.log('[worker stats]', worker.stats);
} finally {
  stopLogging();
  await worker.stop();
}
