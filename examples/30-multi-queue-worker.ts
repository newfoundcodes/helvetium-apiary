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

import { createApiary, MemoryQueueStore, Worker } from '@newfoundcodes/helvetium-apiary';
import { logJobLifecycle } from './_logging.ts';

const apiary = createApiary({ store: new MemoryQueueStore() });
const stopLogging = logJobLifecycle(apiary, 'multi-queue');

apiary.define('task', async (payload: { queue: string; id: number }) => {
  console.log(`[handler] ${payload.queue} task=${payload.id}`);
  return payload;
});

const jobs = await Promise.all(
  ['critical', 'default', 'bulk'].map((queue, id) =>
    apiary.add('task', { queue, id }, { queue, priority: queue === 'critical' ? 100 : 1 }),
  ),
);

const worker = new Worker(apiary, {
  id: 'multi-queue-worker',
  queues: ['critical', 'default', 'bulk'],
  concurrency: 12,
  order: 'priority',
  pollInterval: 10,
});
void worker.start();

try {
  await Promise.all(jobs.map((job) => apiary.waitUntilFinished(job.id)));

  console.log(
    '[queues]',
    await Promise.all(['critical', 'default', 'bulk'].map((q) => apiary.stats(q))),
  );
  console.log('[worker stats]', worker.stats);
} finally {
  stopLogging();
  await worker.stop();
}
