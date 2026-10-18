import type { JobOptions } from './jobs.js';
import type { QueueStore } from './stores.js';

export interface ApiaryOptions {
  store: QueueStore;
  defaultQueue?: string;
  defaultJobOptions?: JobOptions;

  clock?: () => number;
  idFactory?: () => string;
}
