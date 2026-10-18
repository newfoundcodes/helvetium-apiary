import {
  createApiary,
  createQueue,
  MemoryQueueStore,
  Worker,
} from '@newfoundcodes/helvetium-apiary';
import { logJobLifecycle } from './_logging.ts';

const apiary = createApiary({ store: new MemoryQueueStore() });
const stopLogging = logJobLifecycle(apiary, 'queues');

apiary.define('email', async (payload: { to: string }) => {
  console.log(`[handler] sending email to ${payload.to}`);
});

apiary.define('transcode', async (payload: { asset: string }) => {
  console.log(`[handler] transcoding ${payload.asset}`);
});

const mail = createQueue(apiary, 'mail');
const media = createQueue(apiary, 'media');
const mailJob = await mail.add('email', { to: 'a@example.com' });
const mediaJob = await media.add('transcode', { asset: 'video.mp4' });

media.pause();
console.log('[paused]', media.paused, await media.stats());

const worker = new Worker(apiary, {
  id: 'queue-worker',
  queues: ['mail', 'media'],
  pollInterval: 10,
});
void worker.start();

try {
  await apiary.waitUntilFinished(mailJob.id);

  console.log('[mail stats]', await mail.stats());
  console.log('[action] resuming media queue');

  media.resume();
  await apiary.waitUntilFinished(mediaJob.id);

  console.log('[media stats]', await media.stats());
  console.log('[worker stats]', worker.stats);
} finally {
  stopLogging();
  await worker.stop();
}
