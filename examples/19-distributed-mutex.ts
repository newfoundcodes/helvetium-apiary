import { MemoryQueueStore, Mutex } from '@newfoundcodes/helvetium-apiary';

const mutex = new Mutex(new MemoryQueueStore());
console.log('[mutex] acquiring ledger:account-1');

await mutex.withLock(
  'ledger:account-1',
  async (lease) => {
    console.log(`[mutex] acquired fencingToken=${lease.fencingToken}`);
    console.log('[mutex] performing protected ledger update');
  },
  { ttl: 10_000, wait: 2_000 },
);

console.log('[mutex] released');
