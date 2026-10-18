import {
  createApiary,
  MemoryQueueStore,
  Worker,
  enqueueChain,
  workflowStatus,
} from '@newfoundcodes/helvetium-apiary';
import { logJobLifecycle } from './_logging.ts';

const apiary = createApiary({ store: new MemoryQueueStore() });
const stopLogging = logJobLifecycle(apiary, 'chain');

for (const name of ['validate', 'charge', 'fulfill']) {
  apiary.define(name, async (payload: { id: number }) => {
    console.log(`[handler] ${name} order=${payload.id}`);
    return name;
  });
}

const workflow = await enqueueChain(apiary, [
  { name: 'validate', payload: { id: 1 } },
  { name: 'charge', payload: { id: 1 } },
  { name: 'fulfill', payload: { id: 1 } },
]);
console.log('[workflow queued]', workflow);

const worker = new Worker(apiary, { id: 'chain-worker', pollInterval: 10 });
void worker.start();

try {
  await Promise.all(workflow.jobIds.map((id) => apiary.waitUntilFinished(id)));

  console.log('[workflow result]', await workflowStatus(apiary, workflow.id));
  console.log('[worker stats]', worker.stats);
} finally {
  stopLogging();
  await worker.stop();
}
