import { createApiary, MemoryQueueStore, Scheduler, Worker } from '@newfoundcodes/helvetium-apiary';
import { logJobLifecycle, logScheduleLifecycle } from './_logging.ts';

const apiary = createApiary({ store: new MemoryQueueStore() });
const stopJobLogging = logJobLifecycle(apiary, 'catch-up');
const stopScheduleLogging = logScheduleLifecycle(apiary, 'catch-up');

apiary.define('rollup', async () => {
  console.log('[handler] rolling up metrics');
});

const scheduler = new Scheduler(apiary);
const schedule = await scheduler.add({
  id: 'meter',
  name: 'rollup',
  payload: {},
  every: 60_000,
  misfire: 'catch-up',
  maxCatchUp: 10,
  overlap: 'queue-one',
});

const tickAt = Date.now() + 3 * 60_000;
console.log(
  `[schedule] ${schedule.id} next=${new Date(schedule.nextRunAt!).toISOString()} ` +
    `simulated tick=${new Date(tickAt).toISOString()}`,
);

const worker = new Worker(apiary, { id: 'catch-up-worker', pollInterval: 10 });
void worker.start();

try {
  console.log(`[tick] fired=${await scheduler.tick(tickAt)}`);

  const jobs = await apiary.list({ names: ['rollup'] });
  await Promise.all(jobs.map((job) => apiary.waitUntilFinished(job.id)));

  console.log(`[result] completed ${jobs.length} catch-up jobs`);
  console.log('[worker stats]', worker.stats);
} finally {
  stopJobLogging();
  stopScheduleLogging();

  await worker.stop();
}
