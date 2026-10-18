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

import type { Apiary } from './apiary.js';
import type { JobOptions, JobRecord, ListJobsQuery, QueueStats } from './types/jobs.js';

export class ApiaryQueue {
  constructor(
    readonly apiary: Apiary,
    readonly name: string,
  ) {}

  add<T = unknown, R = unknown>(
    jobName: string,
    payload: T,
    options: Omit<JobOptions, 'queue'> = {},
  ): Promise<JobRecord<T, R>> {
    return this.apiary.add(jobName, payload, { ...options, queue: this.name });
  }

  bulk<T = unknown>(
    entries: Array<{ name: string; payload: T; options?: Omit<JobOptions, 'queue'> }>,
  ): Promise<JobRecord<T>[]> {
    return this.apiary.bulk(
      entries.map((e) => ({ ...e, options: { ...e.options, queue: this.name } })),
    );
  }

  list(query: Omit<ListJobsQuery, 'queue'> = {}): Promise<JobRecord[]> {
    return this.apiary.list({ ...query, queue: this.name });
  }

  stats(): Promise<QueueStats> {
    return this.apiary.stats(this.name);
  }

  pause(): void {
    this.apiary.pause(this.name);
  }

  resume(): void {
    this.apiary.resume(this.name);
  }

  get paused(): boolean {
    return this.apiary.isPaused(this.name);
  }
}

export function createQueue(apiary: Apiary, name: string): ApiaryQueue {
  return new ApiaryQueue(apiary, name);
}
