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
const stopLogging = logJobLifecycle(apiary, 'priority');

apiary.define('task', async (payload: { name: string }) => {
  console.log(`[handler] processing ${payload.name}`);
  return payload.name;
});

const low = await apiary.add('task', { name: 'low' }, { priority: 1 });
const urgent = await apiary.add('task', { name: 'urgent' }, { priority: 100 });
const delayed = await apiary.add('task', { name: 'delayed' }, { delay: 150 });
console.log(`[queued] low=${low.id} urgent=${urgent.id} delayed=${delayed.id}`);

const worker = new Worker(apiary, { id: 'priority-worker', pollInterval: 10 });
void worker.start();

try {
  await Promise.all([
    apiary.waitUntilFinished(low.id),
    apiary.waitUntilFinished(urgent.id),
    apiary.waitUntilFinished(delayed.id),
  ]);

  console.log('[stats]', await apiary.stats());
  console.log('[worker stats]', worker.stats);
} finally {
  stopLogging();
  await worker.stop();
}
