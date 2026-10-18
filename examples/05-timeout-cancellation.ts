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
import { logJobLifecycle, sleep } from './_logging.ts';

const apiary = createApiary({ store: new MemoryQueueStore() });
const stopLogging = logJobLifecycle(apiary, 'control');

apiary.define('crawl', async (_, ctx) => {
  for (let i = 0; i < 100; i++) {
    ctx.signal.throwIfAborted();
    await new Promise((r) => setTimeout(r, 10));
  }
});

const timeoutJob = await apiary.add('crawl', {}, { timeout: 50, maxAttempts: 1 });
const cancelledJob = await apiary.add('crawl', {}, { timeout: 500, maxAttempts: 1 });
const worker = new Worker(apiary, { id: 'control-worker', pollInterval: 10 });
void worker.start();

await sleep(25);
console.log(`[action] cancelling ${cancelledJob.id}`);

await apiary.cancel(cancelledJob.id);
try {
  await Promise.allSettled([
    apiary.waitUntilFinished(timeoutJob.id),
    apiary.waitUntilFinished(cancelledJob.id),
  ]);

  console.log('[timeout job]', await apiary.require(timeoutJob.id));
  console.log('[cancelled job]', await apiary.require(cancelledJob.id));
  console.log('[worker stats]', worker.stats);
} finally {
  stopLogging();
  await worker.stop({ graceful: false });
}
