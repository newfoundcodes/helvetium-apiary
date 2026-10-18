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

import type { JobOptions } from './jobs.js';

export type MisfirePolicy = 'skip' | 'fire-once' | 'catch-up';
export type OverlapPolicy = 'allow' | 'skip' | 'queue-one';

export interface ScheduleDefinition<T = unknown> {
  id: string;
  name: string;
  payload: T;
  queue?: string;
  cron?: string;
  every?: number;
  at?: Date | number;
  timezone?: string;
  enabled?: boolean;
  jitter?: number;
  overlap?: OverlapPolicy;
  misfire?: MisfirePolicy;
  maxCatchUp?: number;
  job?: Omit<JobOptions, 'queue'>;
  metadata?: Record<string, unknown>;
}

export interface ScheduleRecord<T = unknown> extends ScheduleDefinition<T> {
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
  nextRunAt?: number;
  runningJobId?: string;
}

export interface SchedulerOptions {
  id?: string;
  tickInterval?: number;
  leaseMs?: number;
  autorun?: boolean;
}
