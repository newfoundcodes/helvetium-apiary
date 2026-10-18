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
import { Scheduler } from './scheduler.js';
import { Worker } from './worker.js';
import type { ApiaryDaemonOptions } from './types/node.js';

export type { ApiaryDaemonOptions } from './types/node.js';

export class ApiaryDaemon {
  readonly workers: Worker[] = [];
  readonly scheduler?: Scheduler;
  private started = false;
  private signalHandlers = new Map<NodeJS.Signals, () => void>();

  constructor(
    readonly apiary: Apiary,
    readonly options: ApiaryDaemonOptions = {},
  ) {
    for (const config of options.workers ?? [{ count: 1 }]) {
      const { count = 1, ...workerOptions } = config;
      for (let i = 0; i < count; i++) {
        this.workers.push(new Worker(apiary, workerOptions));
      }
    }

    if (options.scheduler !== false) {
      this.scheduler = new Scheduler(apiary, options.scheduler ?? {});
    }
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    this.started = true;
    for (const worker of this.workers) {
      void worker.start();
    }

    if (this.scheduler) {
      void this.scheduler.start();
    }

    for (const signal of this.options.signals ?? ['SIGINT', 'SIGTERM']) {
      const handler = () => {
        void this.stop().finally(() => {
          process.exitCode = 0;
        });
      };

      this.signalHandlers.set(signal, handler);
      process.once(signal, handler);
    }
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    this.started = false;
    if (this.scheduler) {
      await this.scheduler.stop();
    }

    await Promise.all(
      this.workers.map((worker) =>
        worker.stop({ graceful: true, timeout: this.options.shutdownTimeout ?? 30_000 }),
      ),
    );

    for (const [signal, handler] of this.signalHandlers) {
      process.off(signal, handler);
    }

    this.signalHandlers.clear();
    await this.apiary.close();
  }
}

export function createApiaryDaemon(apiary: Apiary, options?: ApiaryDaemonOptions): ApiaryDaemon {
  return new ApiaryDaemon(apiary, options);
}
