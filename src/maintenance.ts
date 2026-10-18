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
import type { JobRecord } from './types/jobs.js';

export async function recoverExpiredJobs(
  apiary: Apiary,
  queue = apiary.defaultQueue,
): Promise<number> {
  const before = await apiary.list({ queue, states: ['active'] });
  await apiary.store.claim({
    queue,
    workerId: `recovery-${apiary.createId()}`,
    now: apiary.now(),
    limit: 0,
    leaseMs: 1,
  });

  const after = await apiary.list({ queue, states: ['active'] });
  return Math.max(0, before.length - after.length);
}

export async function pruneJobs(
  apiary: Apiary,
  options: {
    olderThan: number;
    states?: Array<JobRecord['state']>;
    queue?: string;
    limit?: number;
  },
): Promise<number> {
  const cutoff = apiary.now() - options.olderThan;
  const states = options.states ?? ['completed', 'failed', 'dead', 'cancelled'];
  const jobs = await apiary.list({ queue: options.queue, states, limit: options.limit ?? 10_000 });

  let removed = 0;
  for (const job of jobs) {
    if ((job.finishedAt ?? job.updatedAt) < cutoff && (await apiary.remove(job.id))) {
      removed++;
    }
  }

  return removed;
}

export async function retryFailed(
  apiary: Apiary,
  options: { queue?: string; limit?: number; delay?: number } = {},
): Promise<number> {
  const jobs = await apiary.list({
    queue: options.queue,
    states: ['failed', 'dead'],
    limit: options.limit ?? 1000,
  });

  for (const job of jobs) {
    await apiary.retry(job.id, options.delay ?? 0);
  }

  return jobs.length;
}
