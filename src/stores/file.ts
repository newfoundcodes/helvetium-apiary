import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { MemoryQueueStore } from './memory.js';
import type { ClaimOptions, JobRecord, ListJobsQuery, QueueStats } from '../types/jobs.js';
import type { FileStoreSnapshot } from '../types/file-store.js';
import type { LockRecord, QueueStore } from '../types/stores.js';
import type { ScheduleRecord } from '../types/schedules.js';

export class FileQueueStore implements QueueStore {
  readonly name = 'file';
  private readonly memory = new MemoryQueueStore();
  private readonly counters = new Map<string, number>();
  private readonly ready: Promise<void>;
  private writing: Promise<void> = Promise.resolve();

  constructor(readonly file: string) {
    this.ready = this.load();
  }

  private async load(): Promise<void> {
    try {
      const snapshot = JSON.parse(await readFile(this.file, 'utf8')) as FileStoreSnapshot;
      for (const job of snapshot.jobs ?? []) {
        await this.memory.enqueue(job);
      }

      for (const schedule of snapshot.schedules ?? []) {
        await this.memory.putSchedule(schedule);
      }

      for (const [key, value] of Object.entries(snapshot.counters ?? {})) {
        this.counters.set(key, value);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  private async persist(): Promise<void> {
    await this.ready;

    this.writing = this.writing.then(async () => {
      const snapshot: FileStoreSnapshot = {
        version: 1,
        jobs: await this.memory.listJobs(),
        schedules: await this.memory.listSchedules(),
        counters: Object.fromEntries(this.counters),
      };
      await mkdir(dirname(this.file), { recursive: true });

      const temp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temp, JSON.stringify(snapshot), 'utf8');
      await rename(temp, this.file);
    });
    await this.writing;
  }

  async enqueue<T, R>(job: JobRecord<T, R>) {
    await this.ready;

    const value = await this.memory.enqueue(job);
    await this.persist();
    return value;
  }

  async getJob<T, R>(id: string) {
    await this.ready;
    return this.memory.getJob<T, R>(id);
  }

  async updateJob<T, R>(job: JobRecord<T, R>) {
    await this.ready;
    await this.memory.updateJob(job);
    await this.persist();
  }

  async deleteJob(id: string) {
    await this.ready;

    const value = await this.memory.deleteJob(id);
    if (value) {
      await this.persist();
    }

    return value;
  }

  async listJobs(query?: ListJobsQuery) {
    await this.ready;
    return this.memory.listJobs(query);
  }

  async claim(options: ClaimOptions) {
    await this.ready;

    const value = await this.memory.claim(options);
    if (value.length) {
      await this.persist();
    }

    return value;
  }

  async heartbeat(jobId: string, workerId: string, leaseMs: number, now: number) {
    await this.ready;

    const value = await this.memory.heartbeat(jobId, workerId, leaseMs, now);
    if (value) {
      await this.persist();
    }

    return value;
  }

  async stats(queue?: string): Promise<QueueStats> {
    await this.ready;
    return this.memory.stats(queue);
  }

  async findByDedupeKey(queue: string, key: string, now: number) {
    await this.ready;
    return this.memory.findByDedupeKey(queue, key, now);
  }

  async findByUniqueKey(queue: string, key: string, now: number) {
    await this.ready;
    return this.memory.findByUniqueKey(queue, key, now);
  }

  async putSchedule(schedule: ScheduleRecord) {
    await this.ready;
    await this.memory.putSchedule(schedule);
    await this.persist();
  }

  async getSchedule(id: string) {
    await this.ready;
    return this.memory.getSchedule(id);
  }

  async listSchedules() {
    await this.ready;
    return this.memory.listSchedules();
  }

  async deleteSchedule(id: string) {
    await this.ready;

    const value = await this.memory.deleteSchedule(id);
    if (value) {
      await this.persist();
    }

    return value;
  }

  async acquireLock(
    key: string,
    owner: string,
    ttl: number,
    now: number,
  ): Promise<LockRecord | null> {
    await this.ready;
    return this.memory.acquireLock(key, owner, ttl, now);
  }

  async renewLock(
    key: string,
    owner: string,
    token: number,
    ttl: number,
    now: number,
  ): Promise<LockRecord | null> {
    await this.ready;
    return this.memory.renewLock(key, owner, token, ttl, now);
  }

  async releaseLock(key: string, owner: string, token: number) {
    await this.ready;
    return this.memory.releaseLock(key, owner, token);
  }

  async increment(key: string, amount = 1) {
    await this.ready;

    const value = (this.counters.get(key) ?? 0) + amount;
    this.counters.set(key, value);

    await this.persist();
    return value;
  }

  async getCounter(key: string) {
    await this.ready;
    return this.counters.get(key) ?? 0;
  }

  async close() {
    await this.writing;
    await this.memory.close();
  }
}
