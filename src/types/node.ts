import type { SchedulerOptions } from './schedules.js';
import type { WorkerOptions } from './jobs.js';

export interface ApiaryDaemonOptions {
  workers?: Array<WorkerOptions & { count?: number }>;
  scheduler?: SchedulerOptions | false;
  signals?: NodeJS.Signals[];
  shutdownTimeout?: number;
}
