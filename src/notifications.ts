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
import type { JobContext } from './types/jobs.js';
import type { Notification, NotificationChannel } from './types/notifications.js';

export class NotificationCenter {
  private readonly channels = new Map<string, NotificationChannel>();

  constructor(readonly apiary?: Apiary) {}

  register(channel: NotificationChannel): this {
    this.channels.set(channel.name, channel);
    return this;
  }

  unregister(name: string): boolean {
    return this.channels.delete(name);
  }

  listChannels(): string[] {
    return [...this.channels.keys()];
  }

  async send(channelName: string, notification: Notification): Promise<void> {
    const channel = this.channels.get(channelName);
    if (!channel) {
      throw new Error(`Unknown notification channel: ${channelName}`);
    }

    try {
      await channel.send(notification);
      this.apiary?.events.emit('notification:sent', { channel: channelName, notification });
    } catch (error) {
      this.apiary?.events.emit('notification:error', { channel: channelName, notification, error });
      throw error;
    }
  }

  async broadcast(
    channelNames: string[],
    notification: Notification,
  ): Promise<PromiseSettledResult<void>[]> {
    return Promise.allSettled(channelNames.map((name) => this.send(name, notification)));
  }

  createJobHandler(): (
    payload: { channel: string; notification: Notification },
    context: JobContext,
  ) => Promise<void> {
    return async (payload) => this.send(payload.channel, payload.notification);
  }

  async enqueue(
    channel: string,
    notification: Notification,
    options: Parameters<Apiary['add']>[2] = {},
  ) {
    if (!this.apiary) {
      throw new Error('NotificationCenter requires an Apiary instance for queued notifications');
    }

    if (!this.apiary.getDefinition('__apiary:notification')) {
      this.apiary.define('__apiary:notification', this.createJobHandler(), { maxAttempts: 5 });
    }

    return this.apiary.add('__apiary:notification', { channel, notification }, options);
  }
}

export class MemoryNotificationChannel implements NotificationChannel {
  readonly name: string;
  readonly messages: Notification[] = [];

  constructor(name = 'memory') {
    this.name = name;
  }

  async send(notification: Notification): Promise<void> {
    this.messages.push(structuredClone(notification));
  }
}

export class ConsoleNotificationChannel implements NotificationChannel {
  readonly name = 'console';

  async send(notification: Notification): Promise<void> {
    console.log(
      notification.subject ?? notification.topic ?? 'notification',
      notification.text ?? notification.data ?? '',
    );
  }
}

export class WebhookNotificationChannel implements NotificationChannel {
  readonly name: string;

  constructor(
    readonly url: string,
    options: { name?: string; headers?: Record<string, string>; fetch?: typeof fetch } = {},
  ) {
    this.name = options.name ?? 'webhook';
    this.headers = options.headers ?? {};
    this.fetcher = options.fetch ?? fetch;
  }

  private readonly headers: Record<string, string>;
  private readonly fetcher: typeof fetch;

  async send(notification: Notification): Promise<void> {
    const response = await this.fetcher(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...this.headers },
      body: JSON.stringify(notification),
    });

    if (!response.ok) {
      throw new Error(`Webhook failed with ${response.status}`);
    }
  }
}

export function createNotificationCenter(apiary?: Apiary): NotificationCenter {
  return new NotificationCenter(apiary);
}
