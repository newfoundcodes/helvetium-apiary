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

import type { BackoffStrategy } from './types/jobs.js';

export function computeBackoff(
  strategy: BackoffStrategy,
  attempt: number,
  random: () => number = Math.random,
): number {
  if (typeof strategy === 'number') {
    return Math.max(0, strategy);
  }

  const base = Math.max(0, strategy.delay);
  const factor = strategy.factor ?? 2;

  let delay = base;
  if (strategy.type === 'linear') {
    delay = base * Math.max(1, attempt);
  } else if (strategy.type === 'exponential') {
    delay = base * Math.pow(factor, Math.max(0, attempt - 1));
  }

  if (strategy.maxDelay !== undefined) {
    delay = Math.min(delay, Math.max(0, strategy.maxDelay));
  }

  const jitter = Math.min(1, Math.max(0, strategy.jitter ?? 0));
  if (jitter > 0) {
    delay *= 1 - jitter + random() * jitter * 2;
  }

  return Math.max(0, Math.round(delay));
}
