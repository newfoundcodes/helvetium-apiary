import { createApiary, MemoryQueueStore } from '@newfoundcodes/helvetium-apiary';
import { logJobLifecycle } from './_logging.ts';

const apiary = createApiary({ store: new MemoryQueueStore() });
const stopLogging = logJobLifecycle(apiary, 'identity');

apiary.define('webhook', async (payload: { event: string }) => {
  console.log(`[handler] webhook ${payload.event}`);
  return payload.event;
});

apiary.define('rebuild', async (payload: { tenant: string }) => {
  console.log(`[handler] rebuilding ${payload.tenant}`);
  return payload.tenant;
});

const first = await apiary.add(
  'webhook',
  { event: 'e1' },
  { dedupeKey: 'stripe:e1', dedupeTTL: 86_400_000 },
);

const duplicate = await apiary.add(
  'webhook',
  { event: 'e1-duplicate' },
  { dedupeKey: 'stripe:e1', dedupeTTL: 86_400_000 },
);
console.log(`[dedupe] first=${first.id} duplicateReturned=${duplicate.id}`);

const rebuild = await apiary.add(
  'rebuild',
  { tenant: 'acme' },
  { uniqueKey: 'rebuild:acme', uniqueTTL: 3_600_000 },
);
console.log(`[unique] created ${rebuild.id}`);

try {
  await apiary.add(
    'rebuild',
    { tenant: 'acme' },
    { uniqueKey: 'rebuild:acme', uniqueTTL: 3_600_000 },
  );
} catch (error) {
  console.log(`[unique] duplicate rejected: ${error instanceof Error ? error.message : error}`);
}

stopLogging();
