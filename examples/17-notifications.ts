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
