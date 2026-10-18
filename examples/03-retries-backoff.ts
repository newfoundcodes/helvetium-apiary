import { createApiary, MemoryQueueStore, Worker } from '@newfoundcodes/helvetium-apiary';
import { logJobLifecycle } from './_logging.ts';

const apiary = createApiary({ store: new MemoryQueueStore() });
const stopLogging = logJobLifecycle(apiary, 'retry');
const failuresBeforeSuccess = 2;

apiary.define<{ invoice: string }, { charged: boolean }>(
  'charge',
  async (payload, context) => {
    context.log(`attempt ${context.attempt}: charging ${payload.invoice}`);

    if (context.attempt <= failuresBeforeSuccess) {
      throw new Error(`processor unavailable on attempt ${context.attempt}`);
    }

    return { charged: true };
  },
  {
    maxAttempts: 5,
    backoff: { type: 'exponential', delay: 100, factor: 2, maxDelay: 1_000, jitter: 0 },
  },
);

const job = await apiary.add<{ invoice: string }, { charged: boolean }>('charge', {
  invoice: 'inv_123',
});
console.log(`[queued] job ${job.id}`);

const worker = new Worker(apiary, { id: 'retry-demo-worker', pollInterval: 25 });
void worker.start();

try {
  const result = await apiary.waitUntilFinished<{ charged: boolean }>(job.id, 10_000);
  console.log('[result]', result);
  console.log('[worker stats]', worker.stats);
} finally {
  stopLogging();
  await worker.stop();
}
