import { MemoryQueueStore, Semaphore } from '@newfoundcodes/helvetium-apiary';

const semaphore = new Semaphore(new MemoryQueueStore(), 'third-party-api', 5);
console.log('[semaphore] acquiring permit from third-party-api');

const permit = await semaphore.acquire({ wait: 1000 });
try {
  console.log(`[semaphore] acquired slot=${permit.slot} fencingToken=${permit.fencingToken}`);
  console.log('[semaphore] calling constrained API');
} finally {
  console.log(`[semaphore] released=${await permit.release()}`);
}
