import { AtomicCounter, MemoryQueueStore } from '@newfoundcodes/helvetium-apiary';

const counter = new AtomicCounter(new MemoryQueueStore(), 'emails:sent');
console.log('[counter] incrementing emails:sent');
console.log('[counter] after increment=', await counter.increment());
console.log('[counter] current value=', await counter.value());
