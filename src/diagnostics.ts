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
