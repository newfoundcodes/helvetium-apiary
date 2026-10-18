/*
 * Helvetium Apiary - Helvetium Framework, A Newfoundcodes project.
 *
 * Copyright (C) 2026 Jonathan Eldy Baldivicio
 *
 * Author: Jonathan Eldy Baldivicio
 * Contact: jonathaneldy.baldivicio@newfoundcodes.com
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { ApiaryEvents } from './events.js';
import { DuplicateJobError, JobNotFoundError, UnknownJobError } from './errors.js';
import type { ApiaryOptions } from './types/apiary.js';
import type {
  JobDefinition,
  JobHandler,
  JobOptions,
  JobRecord,
  ListJobsQuery,
  QueueStats,
} from './types/jobs.js';
import type { ScheduleRecord } from './types/schedules.js';

const defaultBackoff = {
  type: 'exponential' as const,
  delay: 1000,
  factor: 2,
  maxDelay: 60_000,
  jitter: 0.1,
};

function mergeOptions(base: JobOptions | undefined, next: JobOptions | undefined): JobOptions {
  return { ...(base ?? {}), ...(next ?? {}) };
}

export class Apiary {
  readonly store: ApiaryOptions['store'];
  readonly events = new ApiaryEvents();
  readonly defaultQueue: string;
  readonly defaultJobOptions: JobOptions;
  private readonly clock: () => number;
  private readonly idFactory: () => string;
  private readonly definitions = new Map<string, JobDefinition>();
  private readonly pausedQueues = new Set<string>();

  constructor(options: ApiaryOptions) {
    this.store = options.store;
    this.defaultQueue = options.defaultQueue ?? 'default';
    this.defaultJobOptions = options.defaultJobOptions ?? {};

    this.clock = options.clock ?? Date.now;
    this.idFactory = options.idFactory ?? (() => crypto.randomUUID());
  }

  now(): number {
    return this.clock();
  }

  createId(): string {
    return this.idFactory();
  }

  define<T = unknown, R = unknown>(
    name: string,
    handler: JobHandler<T, R>,
    defaults?: JobOptions,
  ): JobDefinition<T, R> {
    const definition: JobDefinition<T, R> = { name, handler, defaults };

    this.register(definition);
    return definition;
  }

  register<T = unknown, R = unknown>(definition: JobDefinition<T, R>): this {
    if (!definition.name.trim()) {
      throw new TypeError('Job definition name is required');
    }

    this.definitions.set(definition.name, definition as JobDefinition);
    return this;
  }

  unregister(name: string): boolean {
    return this.definitions.delete(name);
  }

  getDefinition(name: string): JobDefinition | undefined {
    return this.definitions.get(name);
  }

  definitionsList(): JobDefinition[] {
    return [...this.definitions.values()];
  }

  async add<T = unknown, R = unknown>(
    name: string,
    payload: T,
    options?: JobOptions,
  ): Promise<JobRecord<T, R>> {
    const definition = this.definitions.get(name);
    const merged = mergeOptions(
      mergeOptions(this.defaultJobOptions, definition?.defaults),
      options,
    );

    const now = this.now();
    const queue = merged.queue ?? this.defaultQueue;

    if (merged.dedupeKey && this.store.findByDedupeKey) {
      const existing = await this.store.findByDedupeKey(queue, merged.dedupeKey, now);
      if (existing) {
        return existing as JobRecord<T, R>;
      }
    }

    if (merged.uniqueKey && this.store.findByUniqueKey) {
      const existing = await this.store.findByUniqueKey(queue, merged.uniqueKey, now);
      if (existing) {
        throw new DuplicateJobError(`Unique job already exists for key ${merged.uniqueKey}`);
      }
    }

    const runAt =
      merged.runAt instanceof Date
        ? merged.runAt.getTime()
        : typeof merged.runAt === 'number'
          ? merged.runAt
          : now + Math.max(0, merged.delay ?? 0);
    const job: JobRecord<T, R> = {
      id: merged.id ?? this.createId(),
      name,
      queue,
      payload,
      state: runAt > now ? 'scheduled' : 'waiting',
      priority: merged.priority ?? 0,
      createdAt: now,
      updatedAt: now,
      runAt,
      attempt: 0,
      maxAttempts: Math.max(1, merged.maxAttempts ?? 3),
      backoff: merged.backoff ?? defaultBackoff,
      timeout: merged.timeout,
      dedupeKey: merged.dedupeKey,
      dedupeUntil: merged.dedupeKey ? now + (merged.dedupeTTL ?? 300_000) : undefined,
      uniqueKey: merged.uniqueKey,
      uniqueUntil: merged.uniqueKey ? now + (merged.uniqueTTL ?? 300_000) : undefined,
      deadLetterQueue: merged.deadLetterQueue,
      tags: [...(merged.tags ?? [])],
      metadata: { ...(merged.metadata ?? {}) },
      traceId: merged.traceId,
      parentId: merged.parentId,
      workflowId: merged.workflowId,
      batchId: merged.batchId,
      dependsOn: [...(merged.dependsOn ?? [])],
      dependencyPolicy: merged.dependencyPolicy ?? 'all-success',
      removeOnComplete: merged.removeOnComplete,
      removeOnFail: merged.removeOnFail,
    };

    const stored = await this.store.enqueue(job);
    this.events.emit('job:enqueued', stored as JobRecord);
    return stored;
  }

  async bulk<T = unknown>(
    entries: Array<{ name: string; payload: T; options?: JobOptions }>,
  ): Promise<JobRecord<T>[]> {
    const result: JobRecord<T>[] = [];
    for (const entry of entries) {
      result.push(await this.add(entry.name, entry.payload, entry.options));
    }

    return result;
  }

  async get<T = unknown, R = unknown>(id: string): Promise<JobRecord<T, R> | null> {
    return this.store.getJob<T, R>(id);
  }

  async require<T = unknown, R = unknown>(id: string): Promise<JobRecord<T, R>> {
    const job = await this.get<T, R>(id);
    if (!job) {
      throw new JobNotFoundError(id);
    }

    return job;
  }

  async list(query?: ListJobsQuery): Promise<JobRecord[]> {
    return this.store.listJobs(query);
  }

  async stats(queue?: string): Promise<QueueStats> {
    return this.store.stats(queue);
  }

  pause(queue = this.defaultQueue): void {
    this.pausedQueues.add(queue);
  }

  resume(queue = this.defaultQueue): void {
    this.pausedQueues.delete(queue);
  }

  isPaused(queue: string): boolean {
    return this.pausedQueues.has(queue);
  }

  async cancel(id: string): Promise<boolean> {
    const job = await this.get(id);
    if (!job || ['completed', 'dead', 'cancelled'].includes(job.state)) {
      return false;
    }

    job.cancelRequested = true;
    if (job.state !== 'active') {
      job.state = 'cancelled';
      job.finishedAt = this.now();

      this.events.emit('job:cancelled', job);
    }

    job.updatedAt = this.now();
    await this.store.updateJob(job);
    return true;
  }

  async retry(id: string, delay = 0): Promise<JobRecord> {
    const job = await this.require(id);
    if (!['failed', 'dead', 'cancelled'].includes(job.state)) {
      throw new Error(`Job ${id} is not retryable from ${job.state}`);
    }

    const now = this.now();
    job.state = delay > 0 ? 'scheduled' : 'waiting';
    job.runAt = now + delay;
    job.updatedAt = now;
    job.finishedAt = undefined;
    job.error = undefined;
    job.cancelRequested = false;
    await this.store.updateJob(job);

    this.events.emit('job:retrying', job);
    return job;
  }

  async remove(id: string): Promise<boolean> {
    return this.store.deleteJob(id);
  }

  async waitUntilFinished<R = unknown>(id: string, timeout = 30_000): Promise<R> {
    const current = await this.require<unknown, R>(id);
    if (current.state === 'completed') {
      return current.result as R;
    }

    if (['failed', 'dead', 'cancelled'].includes(current.state)) {
      throw new Error(current.error?.message ?? `Job ended in ${current.state}`);
    }

    return new Promise<R>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cleanups: Array<() => void> = [];
      const finish = () => {
        if (timer) {
          clearTimeout(timer);
        }

        cleanups.splice(0).forEach((fn) => fn());
      };

      cleanups.push(
        this.events.on('job:completed', (job) => {
          if (job.id === id) {
            finish();
            resolve(job.result as R);
          }
        }),
      );

      const rejectOn = (event: 'job:failed' | 'job:dead' | 'job:cancelled') =>
        this.events.on(event, (job) => {
          if (job.id === id) {
            finish();
            reject(new Error(job.error?.message ?? `Job ended in ${job.state}`));
          }
        });

      cleanups.push(rejectOn('job:failed'), rejectOn('job:dead'), rejectOn('job:cancelled'));
      timer = setTimeout(() => {
        finish();
        reject(new Error(`Timed out waiting for job ${id}`));
      }, timeout);
    });
  }

  async assertRegistered(name: string): Promise<JobDefinition> {
    const definition = this.definitions.get(name);
    if (!definition) {
      throw new UnknownJobError(`No handler registered for job ${name}`);
    }

    return definition;
  }

  async putSchedule(schedule: ScheduleRecord): Promise<void> {
    await this.store.putSchedule(schedule);
  }

  async close(): Promise<void> {
    this.events.clear();
    await this.store.close?.();
  }
}

export function createApiary(options: ApiaryOptions): Apiary {
  return new Apiary(options);
}

export function defineJob<T = unknown, R = unknown>(
  name: string,
  handler: JobHandler<T, R>,
  defaults?: JobOptions,
): JobDefinition<T, R> {
  return { name, handler, defaults };
}
