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
import type { ApiaryAdminOptions, BootMountLike } from './types/boot.js';
import type { JobOptions, JobState } from './types/jobs.js';
import type { ScheduleDefinition } from './types/schedules.js';

const jobStates: readonly JobState[] = [
  'waiting',
  'scheduled',
  'active',
  'completed',
  'failed',
  'dead',
  'cancelled',
];

function parseJobStates(value: string | null): JobState[] | undefined {
  if (!value) {
    return undefined;
  }

  const states = value
    .split(',')
    .filter((state): state is JobState => jobStates.includes(state as JobState));
  return states.length > 0 ? states : undefined;
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store' } });
}

export function createApiaryAdminHandler(apiary: Apiary, options: ApiaryAdminOptions = {}) {
  return {
    async fetch(request: Request): Promise<Response> {
      if (options.authorize && !(await options.authorize(request))) {
        return json({ error: 'Unauthorized' }, 401);
      }

      const url = new URL(request.url);
      const path = url.pathname.replace(/\/$/, '') || '/';
      const method = request.method.toUpperCase();

      if (method === 'GET' && path === '/health') {
        return json({
          ok: true,
          store: apiary.store.name ?? 'custom',
          definitions: apiary.definitionsList().map((d) => d.name),
        });
      }

      if (method === 'GET' && path === '/queues') {
        const jobs = await apiary.list({ limit: 10_000 });
        const queues = [...new Set(jobs.map((j) => j.queue))];
        return json(
          await Promise.all(
            queues.map(async (name) => ({
              name,
              paused: apiary.isPaused(name),
              stats: await apiary.stats(name),
            })),
          ),
        );
      }

      if (method === 'GET' && path === '/jobs') {
        const states = parseJobStates(url.searchParams.get('state'));
        return json(
          await apiary.list({
            queue: url.searchParams.get('queue') ?? undefined,
            states,
            limit: Number(url.searchParams.get('limit') ?? 100),
            offset: Number(url.searchParams.get('offset') ?? 0),
          }),
        );
      }

      const jobMatch = path.match(/^\/jobs\/([^/]+)$/);
      if (method === 'GET' && jobMatch) {
        const job = await apiary.get(decodeURIComponent(jobMatch[1]!));
        return job ? json(job) : json({ error: 'Not found' }, 404);
      }

      if (method === 'POST' && path === '/jobs' && options.allowEnqueue !== false) {
        const body = (await request.json()) as {
          name?: string;
          payload?: unknown;
          options?: Record<string, unknown>;
        };

        if (!body.name) {
          return json({ error: 'name is required' }, 400);
        }

        return json(await apiary.add(body.name, body.payload, body.options as JobOptions), 201);
      }

      const actionMatch = path.match(/^\/jobs\/([^/]+)\/(cancel|retry)$/);
      if (method === 'POST' && actionMatch && options.allowMutation !== false) {
        const id = decodeURIComponent(actionMatch[1]!);
        if (actionMatch[2] === 'cancel') {
          return json({ cancelled: await apiary.cancel(id) });
        }

        return json(await apiary.retry(id));
      }

      if (method === 'GET' && path === '/schedules' && options.scheduler) {
        return json(await options.scheduler.list());
      }

      if (
        method === 'POST' &&
        path === '/schedules' &&
        options.scheduler &&
        options.allowMutation !== false
      ) {
        return json(await options.scheduler.add((await request.json()) as ScheduleDefinition), 201);
      }

      return json({ error: 'Not found' }, 404);
    },
  };
}

export function mountApiary(
  app: BootMountLike,
  prefix: string,
  apiary: Apiary,
  options?: ApiaryAdminOptions,
): BootMountLike {
  app.mount(prefix, createApiaryAdminHandler(apiary, options), { stripPrefix: true });
  return app;
}

export function apiaryContext(apiary: Apiary, key = 'apiary') {
  return async (
    context: { set(name: string, value: unknown): void },
    next: () => Promise<Response>,
  ) => {
    context.set(key, apiary);
    return next();
  };
}

export type { ApiaryAdminOptions, BootMountLike } from './types/boot.js';
