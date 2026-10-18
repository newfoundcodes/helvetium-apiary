import { computeBackoff } from './backoff.js';
import { JobCancelledError, JobTimeoutError } from './errors.js';
import type { Apiary } from './apiary.js';
import type {
  JobContext,
  JobRecord,
  SerializedError,
  WorkerOptions,
  WorkerStats,
} from './types/jobs.js';

function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    const value: SerializedError = { name: error.name, message: error.message, stack: error.stack };
    const e = error as Error & { code?: string | number; cause?: unknown };

    if (e.code !== undefined) {
      value.code = e.code;
    }

    if (e.cause !== undefined) {
      value.cause = e.cause;
    }

    return value;
  }

  return { name: 'Error', message: typeof error === 'string' ? error : JSON.stringify(error) };
}

export class Worker {
  readonly id: string;
  readonly stats: WorkerStats = {
    claimed: 0,
    completed: 0,
    failed: 0,
    retried: 0,
    dead: 0,
    cancelled: 0,
    timedOut: 0,
    active: 0,
  };
  private readonly queues: string[];
  private readonly concurrency: number;
  private readonly pollInterval: number;
  private readonly leaseMs: number;
  private readonly heartbeatInterval: number;
  private readonly order: NonNullable<WorkerOptions['order']>;
  private readonly rateLimit?: WorkerOptions['rateLimit'];
  private running = false;
  private timer?: ReturnType<typeof setTimeout>;
  private active = new Map<string, AbortController>();
  private windows = new Map<string, { start: number; count: number }>();
  private queueCursor = 0;

  constructor(
    readonly apiary: Apiary,
    options: WorkerOptions = {},
  ) {
    this.id = options.id ?? `worker-${crypto.randomUUID()}`;
    this.queues = options.queues?.length ? [...options.queues] : [apiary.defaultQueue];
    this.concurrency = Math.max(1, options.concurrency ?? 1);
    this.pollInterval = Math.max(1, options.pollInterval ?? 100);
    this.leaseMs = Math.max(100, options.leaseMs ?? 30_000);
    this.heartbeatInterval = Math.max(
      50,
      Math.min(options.heartbeatInterval ?? Math.floor(this.leaseMs / 3), this.leaseMs - 1),
    );
    this.order = options.order ?? 'priority';
    this.rateLimit = options.rateLimit;

    if (options.autorun) {
      void this.start();
    }
  }

  get isRunning(): boolean {
    return this.running;
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    await this.poll();
  }

  async stop(options: { graceful?: boolean; timeout?: number } = {}): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
    }

    if (options.graceful === false) {
      for (const controller of this.active.values()) {
        controller.abort(new JobCancelledError('Worker stopped'));
      }
    }

    if (options.graceful !== false && this.active.size) {
      const timeout = options.timeout ?? 30_000;
      const end = Date.now() + timeout;

      while (this.active.size && Date.now() < end) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      if (this.active.size) {
        for (const controller of this.active.values()) {
          controller.abort(new JobCancelledError('Graceful shutdown timeout'));
        }
      }
    }
  }

  async runOnce(): Promise<number> {
    const available = this.concurrency - this.active.size;
    if (available <= 0) {
      return 0;
    }

    let claimed = 0;
    for (let i = 0; i < this.queues.length && claimed < available; i++) {
      const queue = this.queues[(this.queueCursor + i) % this.queues.length]!;
      if (this.apiary.isPaused(queue)) {
        continue;
      }

      const jobs = await this.apiary.store.claim({
        queue,
        workerId: this.id,
        now: this.apiary.now(),
        limit: available - claimed,
        leaseMs: this.leaseMs,
        order: this.order,
      });
      for (const job of jobs) {
        claimed++;
        this.stats.claimed++;

        void this.execute(job).catch((error) =>
          this.apiary.events.emit('worker:error', { workerId: this.id, error }),
        );
      }
    }

    this.queueCursor = (this.queueCursor + 1) % this.queues.length;
    return claimed;
  }

  private async poll(): Promise<void> {
    if (!this.running) {
      return;
    }

    await this.runOnce();
    if (this.running) {
      this.timer = setTimeout(() => void this.poll(), this.pollInterval);
    }
  }

  private rateAllowed(job: JobRecord): boolean {
    if (!this.rateLimit) {
      return true;
    }

    const now = this.apiary.now();
    const key = this.rateLimit.key?.(job) ?? job.queue;

    let window = this.windows.get(key);
    if (!window || now - window.start >= this.rateLimit.windowMs) {
      window = { start: now, count: 0 };
      this.windows.set(key, window);
    }

    if (window.count >= this.rateLimit.max) {
      return false;
    }

    window.count++;
    return true;
  }

  private async execute(job: JobRecord): Promise<void> {
    const controller = new AbortController();
    this.active.set(job.id, controller);
    this.stats.active = this.active.size;

    if (!this.rateAllowed(job)) {
      job.state = 'scheduled';
      job.runAt =
        this.apiary.now() +
        Math.max(10, this.rateLimit!.windowMs / Math.max(1, this.rateLimit!.max));

      delete job.lockedBy;
      delete job.lockExpiresAt;
      delete job.leaseToken;

      job.updatedAt = this.apiary.now();
      await this.apiary.store.updateJob(job);

      this.active.delete(job.id);
      this.stats.active = this.active.size;
      return;
    }

    job.attempt += 1;
    job.updatedAt = this.apiary.now();

    await this.apiary.store.updateJob(job);
    this.apiary.events.emit('job:started', job);

    let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
    const heartbeat = async (): Promise<boolean> => {
      const current = await this.apiary.get(job.id);
      if (!current || current.cancelRequested || current.state === 'cancelled') {
        controller.abort(new JobCancelledError('Job cancelled'));
        return false;
      }

      return this.apiary.store.heartbeat(job.id, this.id, this.leaseMs, this.apiary.now());
    };

    heartbeatTimer = setInterval(() => {
      void heartbeat();
    }, this.heartbeatInterval);

    const context: JobContext = {
      job,
      signal: controller.signal,
      attempt: job.attempt,
      workerId: this.id,
      updateProgress: async (value) => {
        const current = await this.apiary.require(job.id);
        current.progress = value;
        current.updatedAt = this.apiary.now();

        await this.apiary.store.updateJob(current);
        this.apiary.events.emit('job:progress', current);
      },
      isCancelled: async () =>
        (await this.apiary.get(job.id))?.cancelRequested === true || controller.signal.aborted,
      throwIfCancelled: async () => {
        if ((await this.apiary.get(job.id))?.cancelRequested || controller.signal.aborted) {
          throw new JobCancelledError('Job cancelled');
        }
      },
      heartbeat,
      log: (message, data) =>
        this.apiary.events.emit('worker:error', {
          workerId: this.id,
          error: { level: 'log', jobId: job.id, message, data },
        }),
    };

    try {
      const definition = await this.apiary.assertRegistered(job.name);
      let resultPromise = Promise.resolve(definition.handler(job.payload, context));

      if (job.timeout && job.timeout > 0) {
        const timeout = new Promise<never>((_, reject) => {
          const timer = setTimeout(() => {
            controller.abort(new JobTimeoutError(`Job timed out after ${job.timeout}ms`));
            reject(new JobTimeoutError(`Job timed out after ${job.timeout}ms`));
          }, job.timeout);
          resultPromise.finally(() => clearTimeout(timer)).catch(() => undefined);
        });
        resultPromise = Promise.race([resultPromise, timeout]);
      }

      const result = await resultPromise;
      const current = await this.apiary.require(job.id);

      if (current.cancelRequested || controller.signal.aborted) {
        throw new JobCancelledError('Job cancelled');
      }

      current.state = 'completed';
      current.result = result;
      current.finishedAt = this.apiary.now();
      current.updatedAt = current.finishedAt;

      delete current.lockedBy;
      delete current.lockExpiresAt;

      await this.apiary.store.updateJob(current);
      this.stats.completed++;
      this.apiary.events.emit('job:completed', current);

      if (current.removeOnComplete) {
        await this.apiary.store.deleteJob(current.id);
      }
    } catch (error) {
      const current = await this.apiary.require(job.id);
      delete current.lockedBy;
      delete current.lockExpiresAt;

      current.error = serializeError(error);
      current.updatedAt = this.apiary.now();

      if (
        error instanceof JobCancelledError ||
        (controller.signal.aborted && controller.signal.reason instanceof JobCancelledError)
      ) {
        current.state = 'cancelled';
        current.finishedAt = this.apiary.now();
        this.stats.cancelled++;

        await this.apiary.store.updateJob(current);
        this.apiary.events.emit('job:cancelled', current);
      } else if (current.attempt < current.maxAttempts) {
        const delay = computeBackoff(current.backoff, current.attempt);
        current.state = delay > 0 ? 'scheduled' : 'waiting';
        current.runAt = this.apiary.now() + delay;

        this.stats.retried++;
        await this.apiary.store.updateJob(current);

        this.apiary.events.emit('job:retrying', current);
      } else if (current.deadLetterQueue) {
        current.state = 'dead';
        current.finishedAt = this.apiary.now();

        this.stats.dead++;
        await this.apiary.store.updateJob(current);

        this.apiary.events.emit('job:dead', current);
        await this.apiary.add(
          '__apiary:dead-letter',
          { originalJob: current, error: current.error },
          {
            queue: current.deadLetterQueue,
            maxAttempts: 1,
            metadata: { ...current.metadata, originalJobId: current.id, deadLetter: true },
            traceId: current.traceId,
            parentId: current.id,
          },
        );
      } else {
        current.state = 'failed';
        current.finishedAt = this.apiary.now();

        this.stats.failed++;
        if (error instanceof JobTimeoutError) {
          this.stats.timedOut++;
        }

        await this.apiary.store.updateJob(current);
        this.apiary.events.emit('job:failed', current);

        if (current.removeOnFail) {
          await this.apiary.store.deleteJob(current.id);
        }
      }
    } finally {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
      }

      this.active.delete(job.id);
      this.stats.active = this.active.size;
    }
  }
}

export function createWorker(apiary: Apiary, options?: WorkerOptions): Worker {
  return new Worker(apiary, options);
}
