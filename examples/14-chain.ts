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
  enqueueChain,
  workflowStatus,
} from '@newfoundcodes/helvetium-apiary';
import { logJobLifecycle } from './_logging.ts';

const apiary = createApiary({ store: new MemoryQueueStore() });
const stopLogging = logJobLifecycle(apiary, 'chain');

for (const name of ['validate', 'charge', 'fulfill']) {
  apiary.define(name, async (payload: { id: number }) => {
    console.log(`[handler] ${name} order=${payload.id}`);
    return name;
  });
}

const workflow = await enqueueChain(apiary, [
  { name: 'validate', payload: { id: 1 } },
  { name: 'charge', payload: { id: 1 } },
  { name: 'fulfill', payload: { id: 1 } },
]);
console.log('[workflow queued]', workflow);

const worker = new Worker(apiary, { id: 'chain-worker', pollInterval: 10 });
void worker.start();

try {
  await Promise.all(workflow.jobIds.map((id) => apiary.waitUntilFinished(id)));

  console.log('[workflow result]', await workflowStatus(apiary, workflow.id));
  console.log('[worker stats]', worker.stats);
} finally {
  stopLogging();
  await worker.stop();
}
