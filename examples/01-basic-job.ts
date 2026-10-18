import { createApiary, MemoryQueueStore, Worker } from '@newfoundcodes/helvetium-apiary';
import { logJobLifecycle } from './_logging.ts';

const apiary = createApiary({ store: new MemoryQueueStore() });
const stopLogging = logJobLifecycle(apiary, 'basic');

apiary.define('welcome', async ({ email }: { email: string }) => {
  console.log(`[handler] sending welcome email to ${email}`);
  return { sentTo: email };
});

const job = await apiary.add('welcome', { email: 'user@example.com' });
console.log(`[queued] ${job.id} state=${job.state}`);

const worker = new Worker(apiary, { id: 'basic-worker' });
try {
  console.log(`[worker] claimed=${await worker.runOnce()}`);
  console.log('[result]', await apiary.waitUntilFinished<{ sentTo: string }>(job.id));
  console.log('[worker stats]', worker.stats);
} finally {
  stopLogging();
  await apiary.close();
}
