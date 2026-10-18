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

import type { QueueStore, QueueStoreDriver } from '../types/stores.js';

export class DelegatingQueueStore implements QueueStore {
  readonly name?: string;

  constructor(
    readonly driver: QueueStoreDriver,
    name?: string,
  ) {
    this.name = name ?? driver.name;
  }

  enqueue: QueueStore['enqueue'] = (...args) => this.driver.enqueue(...args);
  getJob: QueueStore['getJob'] = (...args) => this.driver.getJob(...args);
  updateJob: QueueStore['updateJob'] = (...args) => this.driver.updateJob(...args);
  deleteJob: QueueStore['deleteJob'] = (...args) => this.driver.deleteJob(...args);
  listJobs: QueueStore['listJobs'] = (...args) => this.driver.listJobs(...args);
  claim: QueueStore['claim'] = (...args) => this.driver.claim(...args);
  heartbeat: QueueStore['heartbeat'] = (...args) => this.driver.heartbeat(...args);
  stats: QueueStore['stats'] = (...args) => this.driver.stats(...args);
  findByDedupeKey: NonNullable<QueueStore['findByDedupeKey']> = (...args) =>
    this.driver.findByDedupeKey?.(...args) ?? null;
  findByUniqueKey: NonNullable<QueueStore['findByUniqueKey']> = (...args) =>
    this.driver.findByUniqueKey?.(...args) ?? null;
  putSchedule: QueueStore['putSchedule'] = (...args) => this.driver.putSchedule(...args);
  getSchedule: QueueStore['getSchedule'] = (...args) => this.driver.getSchedule(...args);
  listSchedules: QueueStore['listSchedules'] = (...args) => this.driver.listSchedules(...args);
  deleteSchedule: QueueStore['deleteSchedule'] = (...args) => this.driver.deleteSchedule(...args);
  acquireLock: QueueStore['acquireLock'] = (...args) => this.driver.acquireLock(...args);
  renewLock: QueueStore['renewLock'] = (...args) => this.driver.renewLock(...args);
  releaseLock: QueueStore['releaseLock'] = (...args) => this.driver.releaseLock(...args);
  increment: QueueStore['increment'] = (...args) => this.driver.increment(...args);
  getCounter: QueueStore['getCounter'] = (...args) => this.driver.getCounter(...args);
  close: NonNullable<QueueStore['close']> = (...args) => this.driver.close?.(...args);
}

export type { QueueStoreDriver } from '../types/stores.js';
