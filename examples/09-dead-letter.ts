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
const stopLogging = logJobLifecycle(apiary, 'dead-letter');

apiary.define('deliver', async () => {
  throw new Error('permanent');
});

const job = await apiary.add(
  'deliver',
  { id: 1 },
  { maxAttempts: 3, deadLetterQueue: 'dead-letter' },
);
const worker = new Worker(apiary, { id: 'dead-letter-worker', pollInterval: 10 });
void worker.start();

try {
  await apiary.waitUntilFinished(job.id).catch((error) => {
    console.log(`[expected] original job ended: ${error.message}`);
  });

  console.log('[dead-letter queue]', await apiary.list({ queue: 'dead-letter' }));
  console.log('[worker stats]', worker.stats);
} finally {
  stopLogging();
  await worker.stop();
}
