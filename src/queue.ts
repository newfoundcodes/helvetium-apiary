import type { Apiary } from './apiary.js';
import type { JobOptions, JobRecord, ListJobsQuery, QueueStats } from './types/jobs.js';

export class ApiaryQueue {
  constructor(
    readonly apiary: Apiary,
    readonly name: string,
  ) {}

  add<T = unknown, R = unknown>(
    jobName: string,
    payload: T,
    options: Omit<JobOptions, 'queue'> = {},
  ): Promise<JobRecord<T, R>> {
    return this.apiary.add(jobName, payload, { ...options, queue: this.name });
  }

  bulk<T = unknown>(
    entries: Array<{ name: string; payload: T; options?: Omit<JobOptions, 'queue'> }>,
  ): Promise<JobRecord<T>[]> {
    return this.apiary.bulk(
      entries.map((e) => ({ ...e, options: { ...e.options, queue: this.name } })),
    );
  }

  list(query: Omit<ListJobsQuery, 'queue'> = {}): Promise<JobRecord[]> {
    return this.apiary.list({ ...query, queue: this.name });
  }

  stats(): Promise<QueueStats> {
    return this.apiary.stats(this.name);
  }

  pause(): void {
    this.apiary.pause(this.name);
  }

  resume(): void {
    this.apiary.resume(this.name);
  }

  get paused(): boolean {
    return this.apiary.isPaused(this.name);
  }
}

export function createQueue(apiary: Apiary, name: string): ApiaryQueue {
  return new ApiaryQueue(apiary, name);
}
