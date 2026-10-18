import { createApiary } from '@newfoundcodes/helvetium-apiary';
import { FileQueueStore } from '@newfoundcodes/helvetium-apiary/stores';

const apiary = createApiary({ store: new FileQueueStore('./var/apiary.json') });
const job = await apiary.add('durable', { message: 'survives restart' });

console.log(`[file store] persisted job ${job.id}`);
console.log('[file store] jobs before close=', await apiary.list());

await apiary.close();
console.log('[file store] closed; data remains in ./var/apiary.json');
