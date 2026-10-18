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

import type { MaybePromise } from '@newfoundcodes/helvetium-boot';

export type JobState =
  'waiting' | 'scheduled' | 'active' | 'completed' | 'failed' | 'dead' | 'cancelled';

export type BackoffKind = 'fixed' | 'linear' | 'exponential';

export type BackoffStrategy =
  | number
  | { type: BackoffKind; delay: number; factor?: number; maxDelay?: number; jitter?: number };

export type QueueOrder = 'priority' | 'fifo' | 'lifo';

export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
  cause?: unknown;
  code?: string | number;
}

export interface JobOptions {
  queue?: string;
  id?: string;
  delay?: number;
  runAt?: Date | number;
  priority?: number;
  maxAttempts?: number;
  backoff?: BackoffStrategy;
  timeout?: number;
  dedupeKey?: string;
  dedupeTTL?: number;
  uniqueKey?: string;
  uniqueTTL?: number;
  deadLetterQueue?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  traceId?: string;
  parentId?: string;
  workflowId?: string;
  batchId?: string;
  dependsOn?: string[];
  dependencyPolicy?: 'all-success' | 'all-settled';
  removeOnComplete?: boolean;
  removeOnFail?: boolean;
}

export interface JobRecord<T = unknown, R = unknown> {
  id: string;
  name: string;
  queue: string;
  payload: T;
  state: JobState;
  priority: number;
  createdAt: number;
  updatedAt: number;
  runAt: number;
  startedAt?: number;
  finishedAt?: number;
  attempt: number;
  maxAttempts: number;
  backoff: BackoffStrategy;
  timeout?: number;
  dedupeKey?: string;
  dedupeUntil?: number;
  uniqueKey?: string;
  uniqueUntil?: number;
  deadLetterQueue?: string;
  tags: string[];
  metadata: Record<string, unknown>;
  traceId?: string;
  parentId?: string;
  workflowId?: string;
  batchId?: string;
  dependsOn: string[];
  dependencyPolicy: 'all-success' | 'all-settled';
  progress?: number | Record<string, unknown>;
  result?: R;
  error?: SerializedError;
  lockedBy?: string;
  lockExpiresAt?: number;
  leaseToken?: number;
  cancelRequested?: boolean;
  removeOnComplete?: boolean;
  removeOnFail?: boolean;
}

export interface QueueStats {
  waiting: number;
  scheduled: number;
  active: number;
  completed: number;
  failed: number;
  dead: number;
  cancelled: number;
  total: number;
}

export interface ClaimOptions {
  queue: string;
  workerId: string;
  now: number;
  limit: number;
  leaseMs: number;
  order?: QueueOrder;
}

export interface ListJobsQuery {
  queue?: string;
  states?: JobState[];
  names?: string[];
  tags?: string[];
  workflowId?: string;
  batchId?: string;
  limit?: number;
  offset?: number;
}

export interface JobContext<T = unknown> {
  readonly job: JobRecord<T>;
  readonly signal: AbortSignal;
  readonly attempt: number;
  readonly workerId: string;

  updateProgress(value: number | Record<string, unknown>): Promise<void>;
  isCancelled(): Promise<boolean>;
  throwIfCancelled(): Promise<void>;
  heartbeat(): Promise<boolean>;
  log(message: string, data?: Record<string, unknown>): void;
}

export type JobHandler<T = unknown, R = unknown> = (
  payload: T,
  context: JobContext<T>,
) => MaybePromise<R>;

export interface JobDefinition<T = unknown, R = unknown> {
  name: string;
  handler: JobHandler<T, R>;
  defaults?: JobOptions;
}

export interface WorkerOptions {
  id?: string;
  queues?: string[];
  concurrency?: number;
  pollInterval?: number;
  leaseMs?: number;
  heartbeatInterval?: number;
  order?: QueueOrder;
  drainDelay?: number;
  autorun?: boolean;
  rateLimit?: { max: number; windowMs: number; key?: (job: JobRecord) => string };
}

export interface WorkerStats {
  claimed: number;
  completed: number;
  failed: number;
  retried: number;
  dead: number;
  cancelled: number;
  timedOut: number;
  active: number;
}
