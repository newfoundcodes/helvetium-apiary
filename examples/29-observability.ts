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
  inspectApiary,
  isHealthy,
} from '@newfoundcodes/helvetium-apiary';
import { logJobLifecycle } from './_logging.ts';

const apiary = createApiary({ store: new MemoryQueueStore() });
const stopLogging = logJobLifecycle(apiary, 'observability');

apiary.define('ok', async () => ({ ok: true }));
apiary.define(
  'bad',
  async () => {
    throw new Error('observability demo failure');
  },
  { maxAttempts: 1 },
);

const good = await apiary.add('ok', {});
const bad = await apiary.add('bad', {});

const worker = new Worker(apiary, { id: 'observability-worker', pollInterval: 10 });
void worker.start();

try {
  await Promise.allSettled([apiary.waitUntilFinished(good.id), apiary.waitUntilFinished(bad.id)]);

  console.log('[healthy]', await isHealthy(apiary));
  console.log('[snapshot]', await inspectApiary(apiary, [worker]));
} finally {
  stopLogging();
  await worker.stop();
}
