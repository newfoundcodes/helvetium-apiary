import type { Apiary } from './apiary.js';
import type { Worker } from './worker.js';
import type { Scheduler } from './scheduler.js';

export async function inspectApiary(apiary: Apiary, workers: Worker[] = [], scheduler?: Scheduler) {
  const jobs = await apiary.list({ limit: 100_000 });
  const queues = [...new Set(jobs.map((job) => job.queue))];
  return {
    store: apiary.store.name ?? 'custom',
    registeredJobs: apiary.definitionsList().map((definition) => definition.name),
    queues: await Promise.all(
      queues.map(async (queue) => ({
        name: queue,
        paused: apiary.isPaused(queue),
        stats: await apiary.stats(queue),
      })),
    ),
    workers: workers.map((worker) => ({
      id: worker.id,
      running: worker.isRunning,
      stats: { ...worker.stats },
    })),
    schedules: scheduler ? await scheduler.list() : await apiary.store.listSchedules(),
  };
}

export async function isHealthy(apiary: Apiary): Promise<boolean> {
  try {
    await apiary.store.stats();
    return true;
  } catch {
    return false;
  }
}
