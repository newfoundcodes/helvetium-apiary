import type {
  ClaimOptions,
  JobRecord,
  JobState,
  ListJobsQuery,
  QueueStats,
} from '../types/jobs.js';
import type { LockRecord, QueueStore } from '../types/stores.js';
import type { ScheduleRecord } from '../types/schedules.js';

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class MemoryQueueStore implements QueueStore {
  readonly name = 'memory';
  private readonly jobs = new Map<string, JobRecord>();
  private readonly schedules = new Map<string, ScheduleRecord>();
  private readonly locks = new Map<string, LockRecord>();
  private readonly counters = new Map<string, number>();
  private lockToken = 0;
  private gate: Promise<void> = Promise.resolve();

  private async atomic<T>(fn: () => T | Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.gate;

    this.gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  async enqueue<T, R>(job: JobRecord<T, R>): Promise<JobRecord<T, R>> {
    return this.atomic(() => {
      if (this.jobs.has(job.id)) {
        throw new Error(`Job already exists: ${job.id}`);
      }

      this.jobs.set(job.id, clone(job as JobRecord));
      return clone(job);
    });
  }

  async getJob<T, R>(id: string): Promise<JobRecord<T, R> | null> {
    const job = this.jobs.get(id);
    return job ? clone(job as JobRecord<T, R>) : null;
  }

  async updateJob<T, R>(job: JobRecord<T, R>): Promise<void> {
    await this.atomic(() => {
      this.jobs.set(job.id, clone(job as JobRecord));
    });
  }

  async deleteJob(id: string): Promise<boolean> {
    return this.atomic(() => this.jobs.delete(id));
  }

  async listJobs(query: ListJobsQuery = {}): Promise<JobRecord[]> {
    let jobs = [...this.jobs.values()];
    if (query.queue) {
      jobs = jobs.filter((j) => j.queue === query.queue);
    }

    if (query.states?.length) {
      jobs = jobs.filter((j) => query.states!.includes(j.state));
    }

    if (query.names?.length) {
      jobs = jobs.filter((j) => query.names!.includes(j.name));
    }

    if (query.tags?.length) {
      jobs = jobs.filter((j) => query.tags!.every((t) => j.tags.includes(t)));
    }

    if (query.workflowId) {
      jobs = jobs.filter((j) => j.workflowId === query.workflowId);
    }

    if (query.batchId) {
      jobs = jobs.filter((j) => j.batchId === query.batchId);
    }

    jobs.sort((a, b) => b.createdAt - a.createdAt);

    const start = query.offset ?? 0;
    return jobs.slice(start, start + (query.limit ?? jobs.length)).map(clone);
  }

  async claim(options: ClaimOptions): Promise<JobRecord[]> {
    return this.atomic(() => {
      const { queue, now, workerId, limit, leaseMs, order = 'priority' } = options;
      for (const job of this.jobs.values()) {
        if (
          job.queue === queue &&
          job.state === 'active' &&
          (job.lockExpiresAt ?? Infinity) <= now
        ) {
          job.state = job.runAt <= now ? 'waiting' : 'scheduled';

          delete job.lockedBy;
          delete job.lockExpiresAt;
          delete job.leaseToken;

          job.updatedAt = now;
        }
      }

      const candidates = [...this.jobs.values()].filter((job) => {
        if (
          job.queue !== queue ||
          !(['waiting', 'scheduled'] as JobState[]).includes(job.state) ||
          job.runAt > now ||
          job.cancelRequested
        ) {
          return false;
        }

        if (!job.dependsOn.length) {
          return true;
        }

        const dependencies = job.dependsOn.map((id) => this.jobs.get(id));
        if (dependencies.some((dep) => !dep)) {
          return false;
        }

        if (job.dependencyPolicy === 'all-settled') {
          return dependencies.every(
            (dep) => dep && ['completed', 'failed', 'dead', 'cancelled'].includes(dep.state),
          );
        }

        return dependencies.every((dep) => dep?.state === 'completed');
      });

      candidates.sort((a, b) => {
        if (order === 'lifo') {
          return b.createdAt - a.createdAt;
        }

        if (order === 'fifo') {
          return a.createdAt - b.createdAt;
        }

        return b.priority - a.priority || a.runAt - b.runAt || a.createdAt - b.createdAt;
      });

      const claimed = candidates.slice(0, limit);
      for (const job of claimed) {
        job.state = 'active';
        job.lockedBy = workerId;
        job.lockExpiresAt = now + leaseMs;
        job.leaseToken = (job.leaseToken ?? 0) + 1;
        job.startedAt ??= now;
        job.updatedAt = now;
      }

      return claimed.map(clone);
    });
  }

  async heartbeat(jobId: string, workerId: string, leaseMs: number, now: number): Promise<boolean> {
    return this.atomic(() => {
      const job = this.jobs.get(jobId);
      if (!job || job.state !== 'active' || job.lockedBy !== workerId) {
        return false;
      }

      job.lockExpiresAt = now + leaseMs;
      job.updatedAt = now;
      return true;
    });
  }

  async stats(queue?: string): Promise<QueueStats> {
    const values = [...this.jobs.values()].filter((j) => !queue || j.queue === queue);
    const states: JobState[] = [
      'waiting',
      'scheduled',
      'active',
      'completed',
      'failed',
      'dead',
      'cancelled',
    ];

    const result = Object.fromEntries(
      states.map((state) => [state, values.filter((j) => j.state === state).length]),
    ) as Omit<QueueStats, 'total'>;
    return { ...result, total: values.length };
  }

  async findByDedupeKey(queue: string, dedupeKey: string, now: number): Promise<JobRecord | null> {
    const job = [...this.jobs.values()].find(
      (j) =>
        j.queue === queue &&
        j.dedupeKey === dedupeKey &&
        (j.dedupeUntil ?? Infinity) > now &&
        !['failed', 'dead', 'cancelled'].includes(j.state),
    );
    return job ? clone(job) : null;
  }

  async findByUniqueKey(queue: string, uniqueKey: string, now: number): Promise<JobRecord | null> {
    const job = [...this.jobs.values()].find(
      (j) =>
        j.queue === queue &&
        j.uniqueKey === uniqueKey &&
        (j.uniqueUntil ?? Infinity) > now &&
        !['failed', 'dead', 'cancelled'].includes(j.state),
    );
    return job ? clone(job) : null;
  }

  async putSchedule(schedule: ScheduleRecord): Promise<void> {
    await this.atomic(() => this.schedules.set(schedule.id, clone(schedule)));
  }

  async getSchedule(id: string): Promise<ScheduleRecord | null> {
    const value = this.schedules.get(id);
    return value ? clone(value) : null;
  }

  async listSchedules(): Promise<ScheduleRecord[]> {
    return [...this.schedules.values()].map(clone);
  }

  async deleteSchedule(id: string): Promise<boolean> {
    return this.atomic(() => this.schedules.delete(id));
  }

  async acquireLock(
    key: string,
    owner: string,
    ttlMs: number,
    now: number,
  ): Promise<LockRecord | null> {
    return this.atomic(() => {
      const current = this.locks.get(key);
      if (current && current.expiresAt > now && current.owner !== owner) {
        return null;
      }

      const record: LockRecord = {
        key,
        owner,
        token: ++this.lockToken,
        acquiredAt: now,
        expiresAt: now + ttlMs,
      };

      this.locks.set(key, record);
      return clone(record);
    });
  }

  async renewLock(
    key: string,
    owner: string,
    token: number,
    ttlMs: number,
    now: number,
  ): Promise<LockRecord | null> {
    return this.atomic(() => {
      const current = this.locks.get(key);
      if (
        !current ||
        current.owner !== owner ||
        current.token !== token ||
        current.expiresAt <= now
      ) {
        return null;
      }

      current.expiresAt = now + ttlMs;
      return clone(current);
    });
  }

  async releaseLock(key: string, owner: string, token: number): Promise<boolean> {
    return this.atomic(() => {
      const current = this.locks.get(key);
      if (!current || current.owner !== owner || current.token !== token) {
        return false;
      }

      return this.locks.delete(key);
    });
  }

  async increment(key: string, amount = 1): Promise<number> {
    return this.atomic(() => {
      const v = (this.counters.get(key) ?? 0) + amount;

      this.counters.set(key, v);
      return v;
    });
  }

  async getCounter(key: string): Promise<number> {
    return this.counters.get(key) ?? 0;
  }

  async close(): Promise<void> {
    this.jobs.clear();
    this.schedules.clear();
    this.locks.clear();
    this.counters.clear();
  }
}
