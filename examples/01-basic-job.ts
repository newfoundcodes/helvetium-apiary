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
const stopLogging = logJobLifecycle(apiary, 'basic');

apiary.define('welcome', async ({ email }: { email: string }) => {
  console.log(`[handler] sending welcome email to ${email}`);
  return { sentTo: email };
});

const job = await apiary.add('welcome', { email: 'user@example.com' });
console.log(`[queued] ${job.id} state=${job.state}`);

const worker = new Worker(apiary, { id: 'basic-worker' });
try {
  console.log(`[worker] claimed=${await worker.runOnce()}`);
  console.log('[result]', await apiary.waitUntilFinished<{ sentTo: string }>(job.id));
  console.log('[worker stats]', worker.stats);
} finally {
  stopLogging();
  await apiary.close();
}
