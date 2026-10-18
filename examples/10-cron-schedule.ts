import { createApiary, MemoryQueueStore, Scheduler } from '@newfoundcodes/helvetium-apiary';
import { logScheduleLifecycle } from './_logging.ts';

const apiary = createApiary({ store: new MemoryQueueStore() });
const stopLogging = logScheduleLifecycle(apiary, 'cron');
const scheduler = new Scheduler(apiary);
const schedule = await scheduler.add({
  id: 'daily-report',
  name: 'report',
  payload: { kind: 'daily' },
  cron: '0 8 * * mon-fri',
  timezone: 'Asia/Manila',
});

console.log(`[schedule] ${schedule.id} next run=${new Date(schedule.nextRunAt!).toISOString()}`);
console.log('[schedules]', await scheduler.list());
stopLogging();
