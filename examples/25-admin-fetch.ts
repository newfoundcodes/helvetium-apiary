import { createApiary, MemoryQueueStore } from '@newfoundcodes/helvetium-apiary';
import { createApiaryAdminHandler } from '@newfoundcodes/helvetium-apiary/boot';

const apiary = createApiary({ store: new MemoryQueueStore() });
const admin = createApiaryAdminHandler(apiary, {
  authorize: (req) => req.headers.get('authorization') === 'Bearer ops',
});

const response = await admin.fetch(
  new Request('https://app.test/health', { headers: { authorization: 'Bearer ops' } }),
);
console.log(`[admin] health status=${response.status}`, await response.json());

const denied = await admin.fetch(new Request('https://app.test/health'));
console.log(`[admin] unauthorized status=${denied.status}`, await denied.json());
