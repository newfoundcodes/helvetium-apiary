import { createApiary, MemoryQueueStore, Scheduler, Worker } from '@newfoundcodes/helvetium-apiary';
import { logJobLifecycle, logScheduleLifecycle } from './_logging.ts';

const apiary = createApiary({ store: new MemoryQueueStore() });
const stopJobLogging = logJobLifecycle(apiary, 'interval');
const stopScheduleLogging = logScheduleLifecycle(apiary, 'interval');

apiary.define('heartbeat', async () => {
  console.log('[handler] heartbeat fired');
  return { ok: true };
});

const scheduler = new Scheduler(apiary);
const schedule = await scheduler.add({
  id: 'heartbeat',
  name: 'heartbeat',
  payload: {},
  every: 30_000,
  overlap: 'skip',
  misfire: 'fire-once',
});
console.log(`[schedule] next run=${new Date(schedule.nextRunAt!).toISOString()}`);

const worker = new Worker(apiary, { id: 'interval-worker', pollInterval: 10 });
void worker.start();

try {
  const fired = await scheduler.tick(schedule.nextRunAt);
  console.log(`[tick] fired=${fired}`);

  const job = (await apiary.list({ names: ['heartbeat'] }))[0];
  if (job) {
    await apiary.waitUntilFinished(job.id);
  }

  console.log('[worker stats]', worker.stats);
} finally {
  stopJobLogging();
  stopScheduleLogging();

  await worker.stop();
}
