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

import type { ApiaryEventMap, EventListener } from './types/events.js';

export class ApiaryEvents {
  private readonly listeners = new Map<keyof ApiaryEventMap, Set<EventListener<never>>>();

  on<K extends keyof ApiaryEventMap>(
    event: K,
    listener: EventListener<ApiaryEventMap[K]>,
  ): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }

    set.add(listener as EventListener<never>);
    return () => this.off(event, listener);
  }

  once<K extends keyof ApiaryEventMap>(
    event: K,
    listener: EventListener<ApiaryEventMap[K]>,
  ): () => void {
    const off = this.on(event, (value) => {
      off();
      listener(value);
    });
    return off;
  }

  off<K extends keyof ApiaryEventMap>(event: K, listener: EventListener<ApiaryEventMap[K]>): void {
    this.listeners.get(event)?.delete(listener as EventListener<never>);
  }

  emit<K extends keyof ApiaryEventMap>(event: K, value: ApiaryEventMap[K]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      try {
        listener(value as never);
      } catch {}
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
