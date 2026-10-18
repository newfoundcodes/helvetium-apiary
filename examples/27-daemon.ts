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

import { createApiary, MemoryQueueStore } from '@newfoundcodes/helvetium-apiary';
import { createApiaryDaemon } from '@newfoundcodes/helvetium-apiary/node';
import { logJobLifecycle } from './_logging.ts';

const apiary = createApiary({ store: new MemoryQueueStore() });
const stopLogging = logJobLifecycle(apiary, 'daemon');
apiary.define('work', async (payload: { id: number }) => {
  console.log(`[handler] daemon processed job ${payload.id}`);
  return payload.id;
});

const jobs = await Promise.all([
  apiary.add('work', { id: 1 }, { queue: 'critical' }),
  apiary.add('work', { id: 2 }, { queue: 'critical' }),
  apiary.add('work', { id: 3 }),
  apiary.add('work', { id: 4 }),
]);

const daemon = createApiaryDaemon(apiary, {
  workers: [
    { queues: ['critical'], count: 1, concurrency: 2 },
    { queues: ['default'], count: 1, concurrency: 2 },
  ],
  scheduler: false,
});

await daemon.start();
console.log(`[daemon] started workers=${daemon.workers.length}`);

try {
  await Promise.all(jobs.map((job) => apiary.waitUntilFinished(job.id)));

  console.log('[daemon] all jobs completed');
  console.log(
    '[worker stats]',
    daemon.workers.map((worker) => worker.stats),
  );
} finally {
  stopLogging();
  await daemon.stop();

  console.log('[daemon] stopped');
}
