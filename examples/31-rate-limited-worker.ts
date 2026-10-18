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
const stopLogging = logJobLifecycle(apiary, 'rate-limit');

apiary.define('github', async (payload: { id: number; tenant: string }) => {
  console.log(`[handler] GitHub request id=${payload.id} tenant=${payload.tenant}`);
  return payload.id;
});

const jobs = await Promise.all(
  Array.from({ length: 5 }, (_, id) =>
    apiary.add('github', { id, tenant: 'acme' }, { queue: 'github', metadata: { tenant: 'acme' } }),
  ),
);

const worker = new Worker(apiary, {
  id: 'rate-limit-worker',
  queues: ['github'],
  concurrency: 10,
  pollInterval: 10,
  rateLimit: { max: 2, windowMs: 100, key: (job) => String(job.metadata.tenant ?? 'global') },
});
void worker.start();

try {
  await Promise.all(jobs.map((job) => apiary.waitUntilFinished(job.id)));

  console.log('[rate-limit] all requests completed');
  console.log('[worker stats]', worker.stats);
} finally {
  stopLogging();
  await worker.stop();
}
