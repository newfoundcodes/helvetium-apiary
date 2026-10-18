import { LeaderElector, MemoryQueueStore, Mutex } from '@newfoundcodes/helvetium-apiary';

const leader = new LeaderElector(new Mutex(new MemoryQueueStore()), 'billing-rollup');
console.log('[leader] campaigning for billing-rollup');

if (await leader.campaign({ ttl: 15_000 })) {
  console.log(`[leader] elected fencingToken=${leader.fencingToken}`);
  console.log('[leader] running billing rollup');

  await leader.resign();
  console.log(`[leader] resigned isLeader=${leader.isLeader}`);
} else {
  console.log('[leader] another process is already leader');
}
