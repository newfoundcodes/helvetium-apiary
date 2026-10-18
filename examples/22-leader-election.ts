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

import { LeaderElector, MemoryQueueStore, Mutex } from '@newfoundcodes/helvetium-apiary';

const leader = new LeaderElector(new Mutex(new MemoryQueueStore()), 'billing-rollup');
console.log('[leader] campaigning for billing-rollup');

if (await leader.campaign({ ttl: 15_000 })) {
  console.log(`[leader] elected fencingToken=${leader.fencingToken}`);
  console.log('[leader] running billing rollup');

  await leader.resign();
  console.log(`[leader] resigned isLeader=${leader.isLeader}`);
} else {
  console.log('[leader] another process is already leader');
}
