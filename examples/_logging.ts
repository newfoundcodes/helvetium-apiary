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
