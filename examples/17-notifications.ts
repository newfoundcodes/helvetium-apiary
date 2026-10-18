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

import {
  createApiary,
  MemoryQueueStore,
  Worker,
  NotificationCenter,
  MemoryNotificationChannel,
} from '@newfoundcodes/helvetium-apiary';
import { logJobLifecycle } from './_logging.ts';

const apiary = createApiary({ store: new MemoryQueueStore() });
const stopLogging = logJobLifecycle(apiary, 'notification');

const inbox = new MemoryNotificationChannel('inbox');
const center = new NotificationCenter(apiary).register(inbox);

apiary.events.on('notification:sent', ({ channel, notification }) => {
  console.log(`[notification sent] channel=${channel}`, notification);
});

const job = await center.enqueue('inbox', {
  subject: 'Build complete',
  text: 'Release 42 is ready.',
});
console.log(`[queued] notification job ${job.id}`);

const worker = new Worker(apiary, { id: 'notification-worker', pollInterval: 10 });
void worker.start();

try {
  await apiary.waitUntilFinished(job.id);

  console.log('[inbox messages]', inbox.messages);
  console.log('[worker stats]', worker.stats);
} finally {
  stopLogging();
  await worker.stop();
}
