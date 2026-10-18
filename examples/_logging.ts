import type { Apiary } from '@newfoundcodes/helvetium-apiary';

export function logJobLifecycle(apiary: Apiary, label: string): () => void {
  const off = [
    apiary.events.on('job:enqueued', (job) => {
      console.log(`[${label}:queued] ${job.name} ${job.id} queue=${job.queue}`);
    }),
    apiary.events.on('job:started', (job) => {
      console.log(`[${label}:started] ${job.name} attempt=${job.attempt}/${job.maxAttempts}`);
    }),
    apiary.events.on('job:progress', (job) => {
      console.log(`[${label}:progress] ${job.name} ${JSON.stringify(job.progress)}`);
    }),
    apiary.events.on('job:retrying', (job) => {
      const delay = Math.max(0, job.runAt - Date.now());
      console.log(
        `[${label}:retrying] ${job.name} error=${job.error?.message ?? 'unknown'} next=${delay}ms`,
      );
    }),
    apiary.events.on('job:completed', (job) => {
      console.log(`[${label}:completed] ${job.name} ${job.id} attempt=${job.attempt}`);
    }),
    apiary.events.on('job:failed', (job) => {
      console.error(`[${label}:failed] ${job.name} ${job.error?.message ?? 'unknown'}`);
    }),
    apiary.events.on('job:dead', (job) => {
      console.error(`[${label}:dead] ${job.name} ${job.error?.message ?? 'unknown'}`);
    }),
    apiary.events.on('job:cancelled', (job) => {
      console.log(`[${label}:cancelled] ${job.name} ${job.id}`);
    }),
    apiary.events.on('worker:error', ({ workerId, error }) => {
      if (
        typeof error === 'object' &&
        error !== null &&
        'level' in error &&
        error.level === 'log' &&
        'message' in error
      ) {
        const data = 'data' in error ? error.data : undefined;
        if (data === undefined) {
          console.log(`[${label}:log] ${String(error.message)}`);
        } else {
          console.log(`[${label}:log] ${String(error.message)}`, data);
        }

        return;
      }

      console.error(`[${label}:worker-error] ${workerId}`, error);
    }),
  ];
  return () => off.forEach((remove) => remove());
}

export function logScheduleLifecycle(apiary: Apiary, label: string): () => void {
  const off = apiary.events.on('schedule:fired', ({ schedule, job }) => {
    console.log(`[${label}:fired] ${schedule.id} created job ${job.id}`);
  });
  return off;
}

export function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
