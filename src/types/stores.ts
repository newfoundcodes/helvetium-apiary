import type { MaybePromise } from '@newfoundcodes/helvetium-boot';
import type { ClaimOptions, JobRecord, ListJobsQuery, QueueStats } from './jobs.js';
import type { ScheduleRecord } from './schedules.js';

export interface LockRecord {
  key: string;
  owner: string;
  token: number;
  acquiredAt: number;
  expiresAt: number;
}

export type QueueStoreDriver = QueueStore;

export interface QueueStore {
  readonly name?: string;
  enqueue<T = unknown, R = unknown>(job: JobRecord<T, R>): MaybePromise<JobRecord<T, R>>;
  getJob<T = unknown, R = unknown>(id: string): MaybePromise<JobRecord<T, R> | null>;
  updateJob<T = unknown, R = unknown>(job: JobRecord<T, R>): MaybePromise<void>;
  deleteJob(id: string): MaybePromise<boolean>;
  listJobs(query?: ListJobsQuery): MaybePromise<JobRecord[]>;
  claim(options: ClaimOptions): MaybePromise<JobRecord[]>;
  heartbeat(jobId: string, workerId: string, leaseMs: number, now: number): MaybePromise<boolean>;
  stats(queue?: string): MaybePromise<QueueStats>;
  findByDedupeKey?(queue: string, dedupeKey: string, now: number): MaybePromise<JobRecord | null>;
  findByUniqueKey?(queue: string, uniqueKey: string, now: number): MaybePromise<JobRecord | null>;
  putSchedule(schedule: ScheduleRecord): MaybePromise<void>;
  getSchedule(id: string): MaybePromise<ScheduleRecord | null>;
  listSchedules(): MaybePromise<ScheduleRecord[]>;
  deleteSchedule(id: string): MaybePromise<boolean>;

  acquireLock(
    key: string,
    owner: string,
    ttlMs: number,
    now: number,
  ): MaybePromise<LockRecord | null>;

  renewLock(
    key: string,
    owner: string,
    token: number,
    ttlMs: number,
    now: number,
  ): MaybePromise<LockRecord | null>;

  releaseLock(key: string, owner: string, token: number): MaybePromise<boolean>;
  increment(key: string, amount?: number): MaybePromise<number>;
  getCounter(key: string): MaybePromise<number>;
  close?(): MaybePromise<void>;
}
