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

import { NotificationCenter, WebhookNotificationChannel } from '@newfoundcodes/helvetium-apiary';

const fetcher: typeof fetch = async (input, init) => {
  console.log('[webhook request]', input, init?.body);
  return new Response(null, { status: 202 });
};

const center = new NotificationCenter().register(
  new WebhookNotificationChannel('https://hooks.example.com/deploy', {
    name: 'deploy-webhook',
    headers: { authorization: 'Bearer secret' },
    fetch: fetcher,
  }),
);
console.log('[channels]', center.listChannels());

await center.send('deploy-webhook', { topic: 'deploy', data: { version: '1.2.3' } });
console.log('[webhook] notification accepted by mock endpoint');
