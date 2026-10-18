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

import { createApiary, MemoryQueueStore, Scheduler } from '@newfoundcodes/helvetium-apiary';
import { logScheduleLifecycle } from './_logging.ts';

const apiary = createApiary({ store: new MemoryQueueStore() });
const stopLogging = logScheduleLifecycle(apiary, 'cron');
const scheduler = new Scheduler(apiary);
const schedule = await scheduler.add({
  id: 'daily-report',
  name: 'report',
  payload: { kind: 'daily' },
  cron: '0 8 * * mon-fri',
  timezone: 'Asia/Manila',
});

console.log(`[schedule] ${schedule.id} next run=${new Date(schedule.nextRunAt!).toISOString()}`);
console.log('[schedules]', await scheduler.list());
stopLogging();
