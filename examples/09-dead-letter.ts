import { createApiary, MemoryQueueStore, Worker } from '@newfoundcodes/helvetium-apiary';
import { logJobLifecycle } from './_logging.ts';

const apiary = createApiary({ store: new MemoryQueueStore() });
const stopLogging = logJobLifecycle(apiary, 'dead-letter');

apiary.define('deliver', async () => {
  throw new Error('permanent');
});

const job = await apiary.add(
  'deliver',
  { id: 1 },
  { maxAttempts: 3, deadLetterQueue: 'dead-letter' },
);
const worker = new Worker(apiary, { id: 'dead-letter-worker', pollInterval: 10 });
void worker.start();

try {
  await apiary.waitUntilFinished(job.id).catch((error) => {
    console.log(`[expected] original job ended: ${error.message}`);
  });

  console.log('[dead-letter queue]', await apiary.list({ queue: 'dead-letter' }));
  console.log('[worker stats]', worker.stats);
} finally {
  stopLogging();
  await worker.stop();
}
