import {
  createApiary,
  MemoryQueueStore,
  pruneJobs,
  retryFailed,
  Worker,
} from '@newfoundcodes/helvetium-apiary';
import { logJobLifecycle } from './_logging.ts';

const apiary = createApiary({ store: new MemoryQueueStore() });
const stopLogging = logJobLifecycle(apiary, 'maintenance');

apiary.define(
  'unstable',
  async () => {
    throw new Error('maintenance demo failure');
  },
  { maxAttempts: 1 },
);

const failed = await apiary.add('unstable', {});
const worker = new Worker(apiary, { id: 'maintenance-worker', pollInterval: 10 });
void worker.start();

try {
  await apiary.waitUntilFinished(failed.id).catch(() => undefined);
  console.log(
    `[maintenance] failed jobs before retry=${(await apiary.list({ states: ['failed'] })).length}`,
  );
  console.log(`[maintenance] retried=${await retryFailed(apiary, { limit: 100 })}`);

  await apiary.waitUntilFinished(failed.id).catch(() => undefined);
  console.log(`[maintenance] pruned=${await pruneJobs(apiary, { olderThan: 0 })}`);
  console.log('[maintenance] remaining jobs=', await apiary.list());
} finally {
  stopLogging();
  await worker.stop();
}
