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
const stopJobLogging = logJobLifecycle(apiary, 'one-shot');
const stopScheduleLogging = logScheduleLifecycle(apiary, 'one-shot');

apiary.define('launch-campaign', async (payload: { campaign: string }) => {
  console.log(`[handler] launching ${payload.campaign}`);
  return payload.campaign;
});

const scheduler = new Scheduler(apiary);
const schedule = await scheduler.add({
  id: 'launch',
  name: 'launch-campaign',
  payload: { campaign: 'fall' },
  at: new Date('2026-10-01T00:00:00Z'),
});
console.log(`[schedule] ${schedule.id} enabled=${schedule.enabled}`);

const worker = new Worker(apiary, { id: 'one-shot-worker', pollInterval: 10 });
void worker.start();

try {
  console.log(`[tick] fired=${await scheduler.tick(Date.now())}`);

  const job = (await apiary.list({ names: ['launch-campaign'] }))[0];
  if (job) {
    console.log('[result]', await apiary.waitUntilFinished(job.id));
  }

  console.log('[schedules]', await scheduler.list());
} finally {
  stopJobLogging();
  stopScheduleLogging();

  await worker.stop();
}
