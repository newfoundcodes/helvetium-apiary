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
  pruneJobs,
  retryFailed,
  Worker,
} from '@newfoundcodes/helvetium-apiary';
import { logJobLifecycle } from './_logging.ts';

const apiary = createApiary({ store: new MemoryQueueStore() });
const stopLogging = logJobLifecycle(apiary, 'maintenance');

apiary.define(
  'unstable',
  async () => {
    throw new Error('maintenance demo failure');
  },
  { maxAttempts: 1 },
);

const failed = await apiary.add('unstable', {});
const worker = new Worker(apiary, { id: 'maintenance-worker', pollInterval: 10 });
void worker.start();

try {
  await apiary.waitUntilFinished(failed.id).catch(() => undefined);
  console.log(
    `[maintenance] failed jobs before retry=${(await apiary.list({ states: ['failed'] })).length}`,
  );
  console.log(`[maintenance] retried=${await retryFailed(apiary, { limit: 100 })}`);

  await apiary.waitUntilFinished(failed.id).catch(() => undefined);
  console.log(`[maintenance] pruned=${await pruneJobs(apiary, { olderThan: 0 })}`);
  console.log('[maintenance] remaining jobs=', await apiary.list());
} finally {
  stopLogging();
  await worker.stop();
}
