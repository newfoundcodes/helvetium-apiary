import type { JobRecord } from './jobs.js';
import type { Notification } from './notifications.js';
import type { ScheduleRecord } from './schedules.js';

export type EventListener<T> = (event: T) => void;

export interface ApiaryEventMap {
  'job:enqueued': JobRecord;
  'job:started': JobRecord;
  'job:progress': JobRecord;
  'job:completed': JobRecord;
  'job:failed': JobRecord;
  'job:retrying': JobRecord;
  'job:dead': JobRecord;
  'job:cancelled': JobRecord;

  'schedule:fired': { schedule: ScheduleRecord; job: JobRecord };
  'worker:error': { workerId: string; error: unknown };
  'notification:sent': { channel: string; notification: Notification };
  'notification:error': { channel: string; notification: Notification; error: unknown };
}
