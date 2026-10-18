import type { JobRecord } from './jobs.js';
import type { ScheduleRecord } from './schedules.js';

export interface FileStoreSnapshot {
  version: 1;
  jobs: JobRecord[];
  schedules: ScheduleRecord[];
  counters: Record<string, number>;
}
