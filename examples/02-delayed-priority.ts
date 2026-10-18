import { createApiary, MemoryQueueStore, Worker } from '@newfoundcodes/helvetium-apiary';
import { logJobLifecycle } from './_logging.ts';

const apiary = createApiary({ store: new MemoryQueueStore() });
const stopLogging = logJobLifecycle(apiary, 'priority');

apiary.define('task', async (payload: { name: string }) => {
  console.log(`[handler] processing ${payload.name}`);
  return payload.name;
});

const low = await apiary.add('task', { name: 'low' }, { priority: 1 });
const urgent = await apiary.add('task', { name: 'urgent' }, { priority: 100 });
const delayed = await apiary.add('task', { name: 'delayed' }, { delay: 150 });
console.log(`[queued] low=${low.id} urgent=${urgent.id} delayed=${delayed.id}`);

const worker = new Worker(apiary, { id: 'priority-worker', pollInterval: 10 });
void worker.start();

try {
  await Promise.all([
    apiary.waitUntilFinished(low.id),
    apiary.waitUntilFinished(urgent.id),
    apiary.waitUntilFinished(delayed.id),
  ]);

  console.log('[stats]', await apiary.stats());
  console.log('[worker stats]', worker.stats);
} finally {
  stopLogging();
  await worker.stop();
}
