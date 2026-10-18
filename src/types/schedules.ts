import type { JobOptions } from './jobs.js';

export type MisfirePolicy = 'skip' | 'fire-once' | 'catch-up';
export type OverlapPolicy = 'allow' | 'skip' | 'queue-one';

export interface ScheduleDefinition<T = unknown> {
  id: string;
  name: string;
  payload: T;
  queue?: string;
  cron?: string;
  every?: number;
  at?: Date | number;
  timezone?: string;
  enabled?: boolean;
  jitter?: number;
  overlap?: OverlapPolicy;
  misfire?: MisfirePolicy;
  maxCatchUp?: number;
  job?: Omit<JobOptions, 'queue'>;
  metadata?: Record<string, unknown>;
}

export interface ScheduleRecord<T = unknown> extends ScheduleDefinition<T> {
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
  nextRunAt?: number;
  runningJobId?: string;
}

export interface SchedulerOptions {
  id?: string;
  tickInterval?: number;
  leaseMs?: number;
  autorun?: boolean;
}
