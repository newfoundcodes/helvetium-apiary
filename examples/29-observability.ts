import {
  createApiary,
  MemoryQueueStore,
  Worker,
  inspectApiary,
  isHealthy,
} from '@newfoundcodes/helvetium-apiary';
import { logJobLifecycle } from './_logging.ts';

const apiary = createApiary({ store: new MemoryQueueStore() });
const stopLogging = logJobLifecycle(apiary, 'observability');

apiary.define('ok', async () => ({ ok: true }));
apiary.define(
  'bad',
  async () => {
    throw new Error('observability demo failure');
  },
  { maxAttempts: 1 },
);

const good = await apiary.add('ok', {});
const bad = await apiary.add('bad', {});

const worker = new Worker(apiary, { id: 'observability-worker', pollInterval: 10 });
void worker.start();

try {
  await Promise.allSettled([apiary.waitUntilFinished(good.id), apiary.waitUntilFinished(bad.id)]);

  console.log('[healthy]', await isHealthy(apiary));
  console.log('[snapshot]', await inspectApiary(apiary, [worker]));
} finally {
  stopLogging();
  await worker.stop();
}
