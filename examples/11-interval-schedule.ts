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

import { createApiary, MemoryQueueStore, Scheduler, Worker } from '@newfoundcodes/helvetium-apiary';
import { logJobLifecycle, logScheduleLifecycle } from './_logging.ts';

const apiary = createApiary({ store: new MemoryQueueStore() });
const stopJobLogging = logJobLifecycle(apiary, 'interval');
const stopScheduleLogging = logScheduleLifecycle(apiary, 'interval');

apiary.define('heartbeat', async () => {
  console.log('[handler] heartbeat fired');
  return { ok: true };
});

const scheduler = new Scheduler(apiary);
const schedule = await scheduler.add({
  id: 'heartbeat',
  name: 'heartbeat',
  payload: {},
  every: 30_000,
  overlap: 'skip',
  misfire: 'fire-once',
});
console.log(`[schedule] next run=${new Date(schedule.nextRunAt!).toISOString()}`);

const worker = new Worker(apiary, { id: 'interval-worker', pollInterval: 10 });
void worker.start();

try {
  const fired = await scheduler.tick(schedule.nextRunAt);
  console.log(`[tick] fired=${fired}`);

  const job = (await apiary.list({ names: ['heartbeat'] }))[0];
  if (job) {
    await apiary.waitUntilFinished(job.id);
  }

  console.log('[worker stats]', worker.stats);
} finally {
  stopJobLogging();
  stopScheduleLogging();

  await worker.stop();
}
