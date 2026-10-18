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
const stopLogging = logJobLifecycle(apiary, 'tenant');

apiary.define('invoice', async (payload: { tenant: string }) => {
  console.log(`[handler] invoicing tenant=${payload.tenant}`);
  return { tenant: payload.tenant, invoiced: true };
});

const jobs = await Promise.all(
  ['acme', 'globex'].map((tenant) =>
    apiary.add(
      'invoice',
      { tenant },
      {
        queue: `tenant:${tenant}`,
        tags: ['billing', tenant],
        uniqueKey: `monthly-invoice:${tenant}:2026-09`,
      },
    ),
  ),
);

console.log(
  '[tenants] queued',
  jobs.map((job) => ({ id: job.id, queue: job.queue })),
);

const worker = new Worker(apiary, {
  id: 'tenant-worker',
  queues: ['tenant:acme', 'tenant:globex'],
  pollInterval: 10,
});
void worker.start();

try {
  await Promise.all(jobs.map((job) => apiary.waitUntilFinished(job.id)));

  console.log('[tenant stats]', await Promise.all(jobs.map((job) => apiary.stats(job.queue))));
  console.log('[worker stats]', worker.stats);
} finally {
  stopLogging();
  await worker.stop();
}
