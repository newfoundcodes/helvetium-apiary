import {
  createApiary,
  MemoryQueueStore,
  Worker,
  enqueueWorkflow,
  workflowStatus,
} from '@newfoundcodes/helvetium-apiary';
import { logJobLifecycle } from './_logging.ts';

const apiary = createApiary({ store: new MemoryQueueStore() });
const stopLogging = logJobLifecycle(apiary, 'workflow');

for (const name of ['build', 'test', 'deploy', 'notify']) {
  apiary.define(name, async (payload: { name?: string }) => {
    console.log(`[handler] ${name} ${payload.name ?? 'node'}`);
    return name;
  });
}

const workflow = await enqueueWorkflow(apiary, {
  id: 'release',
  nodes: [
    { id: 'build', name: 'build', payload: {} },
    { id: 'test', name: 'test', payload: {}, dependsOn: ['build'] },
    { id: 'deploy', name: 'deploy', payload: {}, dependsOn: ['test'] },
    { id: 'notify', name: 'notify', payload: {}, dependsOn: ['deploy'] },
  ],
});
console.log('[workflow queued]', workflow);

const worker = new Worker(apiary, { id: 'workflow-worker', pollInterval: 10 });
void worker.start();

try {
  await Promise.all(workflow.jobIds.map((id) => apiary.waitUntilFinished(id)));

  console.log('[workflow result]', await workflowStatus(apiary, workflow.id));
  console.log('[worker stats]', worker.stats);
} finally {
  stopLogging();
  await worker.stop();
}
