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

import { createApiary, MemoryQueueStore } from '@newfoundcodes/helvetium-apiary';
import { logJobLifecycle } from './_logging.ts';

const apiary = createApiary({ store: new MemoryQueueStore() });
const stopLogging = logJobLifecycle(apiary, 'identity');

apiary.define('webhook', async (payload: { event: string }) => {
  console.log(`[handler] webhook ${payload.event}`);
  return payload.event;
});

apiary.define('rebuild', async (payload: { tenant: string }) => {
  console.log(`[handler] rebuilding ${payload.tenant}`);
  return payload.tenant;
});

const first = await apiary.add(
  'webhook',
  { event: 'e1' },
  { dedupeKey: 'stripe:e1', dedupeTTL: 86_400_000 },
);

const duplicate = await apiary.add(
  'webhook',
  { event: 'e1-duplicate' },
  { dedupeKey: 'stripe:e1', dedupeTTL: 86_400_000 },
);
console.log(`[dedupe] first=${first.id} duplicateReturned=${duplicate.id}`);

const rebuild = await apiary.add(
  'rebuild',
  { tenant: 'acme' },
  { uniqueKey: 'rebuild:acme', uniqueTTL: 3_600_000 },
);
console.log(`[unique] created ${rebuild.id}`);

try {
  await apiary.add(
    'rebuild',
    { tenant: 'acme' },
    { uniqueKey: 'rebuild:acme', uniqueTTL: 3_600_000 },
  );
} catch (error) {
  console.log(`[unique] duplicate rejected: ${error instanceof Error ? error.message : error}`);
}

stopLogging();
