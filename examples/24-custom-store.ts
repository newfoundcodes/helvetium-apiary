import { createApiary, MemoryQueueStore } from '@newfoundcodes/helvetium-apiary';
import { DelegatingQueueStore } from '@newfoundcodes/helvetium-apiary/stores';

const custom = new DelegatingQueueStore(new MemoryQueueStore(), 'my-adapter');
const apiary = createApiary({ store: custom });
const job = await apiary.add('x', {});

console.log(`[custom store] adapter=${custom.name} job=${job.id}`);
console.log('[custom store] stats=', await apiary.stats());

await apiary.close();
