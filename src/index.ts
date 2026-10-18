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

export { Apiary, createApiary, defineJob } from './apiary.js';
export { ApiaryQueue, createQueue } from './queue.js';
export { Worker, createWorker } from './worker.js';
export { Scheduler, createScheduler } from './scheduler.js';
export {
  parseCron,
  cronMatches,
  nextCronOccurrence,
  describeCron,
  type CronPattern,
} from './cron.js';
export { computeBackoff } from './backoff.js';
export { ApiaryEvents } from './events.js';
export {
  Mutex,
  Lease,
  Semaphore,
  SemaphorePermit,
  AtomicCounter,
  Barrier,
  LeaderElector,
  type LockAcquireOptions,
} from './atomics.js';
export {
  NotificationCenter,
  MemoryNotificationChannel,
  ConsoleNotificationChannel,
  WebhookNotificationChannel,
  createNotificationCenter,
} from './notifications.js';
export {
  enqueueBatch,
  enqueueChain,
  enqueueWorkflow,
  batchStatus,
  workflowStatus,
  type WorkflowDefinition,
  type WorkflowNode,
} from './workflows.js';
export { pruneJobs, retryFailed, recoverExpiredJobs } from './maintenance.js';
export { inspectApiary, isHealthy } from './diagnostics.js';
export { MemoryQueueStore } from './stores/memory.js';
export {
  ApiaryError,
  JobNotFoundError,
  DuplicateJobError,
  JobCancelledError,
  JobTimeoutError,
  UnknownJobError,
  LockUnavailableError,
  CronExpressionError,
} from './errors.js';
export type * from './types/index.js';
