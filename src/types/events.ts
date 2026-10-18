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

import type { JobRecord } from './jobs.js';
import type { Notification } from './notifications.js';
import type { ScheduleRecord } from './schedules.js';

export type EventListener<T> = (event: T) => void;

export interface ApiaryEventMap {
  'job:enqueued': JobRecord;
  'job:started': JobRecord;
  'job:progress': JobRecord;
  'job:completed': JobRecord;
  'job:failed': JobRecord;
  'job:retrying': JobRecord;
  'job:dead': JobRecord;
  'job:cancelled': JobRecord;

  'schedule:fired': { schedule: ScheduleRecord; job: JobRecord };
  'worker:error': { workerId: string; error: unknown };
  'notification:sent': { channel: string; notification: Notification };
  'notification:error': { channel: string; notification: Notification; error: unknown };
}
