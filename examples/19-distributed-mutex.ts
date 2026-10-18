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

import { MemoryQueueStore, Mutex } from '@newfoundcodes/helvetium-apiary';

const mutex = new Mutex(new MemoryQueueStore());
console.log('[mutex] acquiring ledger:account-1');

await mutex.withLock(
  'ledger:account-1',
  async (lease) => {
    console.log(`[mutex] acquired fencingToken=${lease.fencingToken}`);
    console.log('[mutex] performing protected ledger update');
  },
  { ttl: 10_000, wait: 2_000 },
);

console.log('[mutex] released');
