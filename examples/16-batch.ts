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

import {
  createApiary,
  MemoryQueueStore,
  Worker,
  enqueueBatch,
  batchStatus,
} from '@newfoundcodes/helvetium-apiary';
import { logJobLifecycle } from './_logging.ts';

const apiary = createApiary({ store: new MemoryQueueStore() });
const stopLogging = logJobLifecycle(apiary, 'batch');

apiary.define('thumbnail', async (payload: { id: number }) => {
  console.log(`[handler] generating thumbnail ${payload.id}`);
  return { id: payload.id, ready: true };
});

const batch = await enqueueBatch(
  apiary,
  [1, 2, 3].map((id) => ({ name: 'thumbnail', payload: { id } })),
);

console.log('[batch queued]', batch);
console.log('[batch pending]', await batchStatus(apiary, batch.id));

const worker = new Worker(apiary, { id: 'batch-worker', pollInterval: 10 });
void worker.start();

try {
  await Promise.all(batch.jobIds.map((id) => apiary.waitUntilFinished(id)));

  console.log('[batch complete]', await batchStatus(apiary, batch.id));
  console.log('[worker stats]', worker.stats);
} finally {
  stopLogging();
  await worker.stop();
}
