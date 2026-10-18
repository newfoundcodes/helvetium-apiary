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
import { mountApiary } from '@newfoundcodes/helvetium-apiary/boot';

const apiary = createApiary({ store: new MemoryQueueStore() });
let mounted: { fetch(request: Request): Response | Promise<Response> } | undefined;

const boot = {
  mount(prefix: string, app: { fetch(request: Request): Response | Promise<Response> }) {
    mounted = app;
    console.log(`[boot] mounted ${prefix}; fetch=${typeof app.fetch}`);
  },
};
mountApiary(boot, '/internal/apiary', apiary, { authorize: () => true });

if (mounted) {
  const response = await mounted.fetch(new Request('https://app.test/health'));
  console.log(`[boot] mounted health status=${response.status}`, await response.json());
}
