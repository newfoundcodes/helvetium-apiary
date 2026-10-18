import { nextCronOccurrence } from './cron.js';
import type { Apiary } from './apiary.js';
import type { ScheduleDefinition, ScheduleRecord, SchedulerOptions } from './types/schedules.js';

function withJitter(time: number, jitter: number, random = Math.random): number {
  return jitter > 0 ? time + Math.floor(random() * jitter) : time;
}

export class Scheduler {
  readonly id: string;
  private readonly tickInterval: number;
  private readonly leaseMs: number;
  private running = false;
  private timer?: ReturnType<typeof setTimeout>;

  constructor(
    readonly apiary: Apiary,
    options: SchedulerOptions = {},
  ) {
    this.id = options.id ?? `scheduler-${crypto.randomUUID()}`;
    this.tickInterval = Math.max(100, options.tickInterval ?? 1000);
    this.leaseMs = Math.max(1000, options.leaseMs ?? 30_000);

    if (options.autorun) {
      void this.start();
    }
  }

  async add<T>(definition: ScheduleDefinition<T>): Promise<ScheduleRecord<T>> {
    const kinds = [
      definition.cron !== undefined,
      definition.every !== undefined,
      definition.at !== undefined,
    ].filter(Boolean).length;

    if (kinds !== 1) {
      throw new TypeError('Schedule must specify exactly one of cron, every, or at');
    }

    const now = this.apiary.now();
    const at = definition.at instanceof Date ? definition.at.getTime() : definition.at;
    const schedule: ScheduleRecord<T> = {
      ...definition,
      enabled: definition.enabled ?? true,
      overlap: definition.overlap ?? 'skip',
      misfire: definition.misfire ?? 'fire-once',
      maxCatchUp: definition.maxCatchUp ?? 100,
      createdAt: now,
      updatedAt: now,
      nextRunAt: at !== undefined ? at : this.computeNext(definition, now - 1),
    };

    await this.apiary.store.putSchedule(schedule);
    return schedule;
  }

  async remove(id: string): Promise<boolean> {
    return this.apiary.store.deleteSchedule(id);
  }

  async list(): Promise<ScheduleRecord[]> {
    return this.apiary.store.listSchedules();
  }

  async enable(id: string): Promise<void> {
    const s = await this.require(id);
    s.enabled = true;
    s.updatedAt = this.apiary.now();

    s.nextRunAt ??=
      s.at !== undefined
        ? s.at instanceof Date
          ? s.at.getTime()
          : s.at
        : this.computeNext(s, this.apiary.now() - 1);
    await this.apiary.store.putSchedule(s);
  }

  async disable(id: string): Promise<void> {
    const s = await this.require(id);
    s.enabled = false;
    s.updatedAt = this.apiary.now();

    await this.apiary.store.putSchedule(s);
  }

  async require(id: string): Promise<ScheduleRecord> {
    const s = await this.apiary.store.getSchedule(id);
    if (!s) {
      throw new Error(`Schedule not found: ${id}`);
    }

    return s;
  }

  private computeNext(
    definition: ScheduleDefinition | ScheduleRecord,
    after: number,
  ): number | undefined {
    if (definition.cron) {
      return withJitter(
        nextCronOccurrence(definition.cron, after, definition.timezone).getTime(),
        definition.jitter ?? 0,
      );
    }

    if (definition.every !== undefined) {
      return withJitter(after + Math.max(1, definition.every), definition.jitter ?? 0);
    }

    if (definition.at !== undefined) {
      const value = definition.at instanceof Date ? definition.at.getTime() : definition.at;
      return value > after ? value : undefined;
    }

    return undefined;
  }

  private async hasRunningOverlap(schedule: ScheduleRecord): Promise<boolean> {
    if (schedule.overlap === 'allow' || !schedule.runningJobId) {
      return false;
    }

    const running = await this.apiary.get(schedule.runningJobId);
    return !!running && ['waiting', 'scheduled', 'active'].includes(running.state);
  }

  private nextAfterNow(schedule: ScheduleRecord, now: number): number | undefined {
    if (schedule.at !== undefined) {
      return undefined;
    }

    return this.computeNext(schedule, now);
  }

  async tick(now = this.apiary.now()): Promise<number> {
    const lease = await this.apiary.store.acquireLock(
      'apiary:scheduler:tick',
      this.id,
      this.leaseMs,
      now,
    );

    if (!lease) {
      return 0;
    }

    let fired = 0;
    try {
      for (const schedule of await this.apiary.store.listSchedules()) {
        if (!schedule.enabled || schedule.nextRunAt === undefined || schedule.nextRunAt > now) {
          continue;
        }

        if (await this.hasRunningOverlap(schedule)) {
          if (schedule.overlap === 'skip') {
            schedule.lastRunAt = schedule.nextRunAt;
            schedule.nextRunAt = this.nextAfterNow(schedule, now);
            schedule.updatedAt = now;

            if (schedule.at !== undefined) {
              schedule.enabled = false;
            }

            await this.apiary.store.putSchedule(schedule);
          }

          continue;
        }

        if (schedule.misfire === 'skip' && schedule.nextRunAt < now) {
          schedule.lastRunAt = schedule.nextRunAt;
          schedule.nextRunAt = this.nextAfterNow(schedule, now);
          schedule.updatedAt = now;

          if (schedule.at !== undefined) {
            schedule.enabled = false;
          }

          await this.apiary.store.putSchedule(schedule);
          continue;
        }

        const due: number[] = [];
        if (schedule.misfire === 'catch-up') {
          let occurrence: number | undefined = schedule.nextRunAt;
          const max = schedule.maxCatchUp ?? 100;

          while (occurrence !== undefined && occurrence <= now && due.length < max) {
            due.push(occurrence);
            if (schedule.at !== undefined) {
              occurrence = undefined;
              break;
            }

            occurrence = this.computeNext(schedule, occurrence);
          }
        } else {
          due.push(schedule.nextRunAt);
        }

        for (const scheduledAt of due) {
          const job = await this.apiary.add(schedule.name, schedule.payload, {
            ...(schedule.job ?? {}),
            queue: schedule.queue,
            dedupeKey: `schedule:${schedule.id}:${scheduledAt}`,
            dedupeTTL: 86_400_000,
            metadata: {
              ...(schedule.job?.metadata ?? {}),
              ...(schedule.metadata ?? {}),
              scheduleId: schedule.id,
              scheduledAt,
            },
          });

          schedule.runningJobId = job.id;
          schedule.lastRunAt = scheduledAt;

          fired++;
          this.apiary.events.emit('schedule:fired', { schedule, job });
        }

        if (schedule.at !== undefined) {
          schedule.nextRunAt = undefined;
          schedule.enabled = false;
        } else if (schedule.misfire === 'catch-up') {
          schedule.nextRunAt = this.computeNext(schedule, due.at(-1) ?? now);

          while (schedule.nextRunAt !== undefined && schedule.nextRunAt <= now) {
            schedule.nextRunAt = this.computeNext(schedule, schedule.nextRunAt);
          }
        } else {
          schedule.nextRunAt = this.nextAfterNow(schedule, now);
        }

        schedule.updatedAt = now;
        await this.apiary.store.putSchedule(schedule);
      }

      return fired;
    } finally {
      await this.apiary.store.releaseLock(lease.key, lease.owner, lease.token);
    }
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    await this.loop();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
    }
  }

  private async loop(): Promise<void> {
    if (!this.running) {
      return;
    }

    await this.tick();
    if (this.running) {
      this.timer = setTimeout(() => void this.loop(), this.tickInterval);
    }
  }
}

export function createScheduler(apiary: Apiary, options?: SchedulerOptions): Scheduler {
  return new Scheduler(apiary, options);
}
