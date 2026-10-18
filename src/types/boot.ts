import type { Scheduler } from '../scheduler.js';

export interface BootMountLike {
  mount(
    prefix: string,
    app: {
      fetch(request: Request, env?: unknown, executionCtx?: unknown): Promise<Response> | Response;
    },
    options?: { stripPrefix?: boolean },
  ): unknown;
}

export interface ApiaryAdminOptions {
  authorize?: (request: Request) => boolean | Promise<boolean>;
  scheduler?: Scheduler;
  allowEnqueue?: boolean;
  allowMutation?: boolean;
}
