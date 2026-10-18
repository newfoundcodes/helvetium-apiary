import { createApiary, MemoryQueueStore } from '@newfoundcodes/helvetium-apiary';
import { mountApiary } from '@newfoundcodes/helvetium-apiary/boot';

const apiary = createApiary({ store: new MemoryQueueStore() });
let mounted: { fetch(request: Request): Response | Promise<Response> } | undefined;

const boot = {
  mount(prefix: string, app: { fetch(request: Request): Response | Promise<Response> }) {
    mounted = app;
    console.log(`[boot] mounted ${prefix}; fetch=${typeof app.fetch}`);
  },
};
mountApiary(boot, '/internal/apiary', apiary, { authorize: () => true });

if (mounted) {
  const response = await mounted.fetch(new Request('https://app.test/health'));
  console.log(`[boot] mounted health status=${response.status}`, await response.json());
}
