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
