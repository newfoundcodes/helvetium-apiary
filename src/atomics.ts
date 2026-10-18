import { LockUnavailableError } from './errors.js';
import type { LockAcquireOptions } from './types/atomics.js';
import type { QueueStore } from './types/stores.js';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class Lease {
  private released = false;

  constructor(
    readonly store: QueueStore,
    readonly key: string,
    readonly owner: string,
    readonly token: number,
    readonly ttlMs: number,
    readonly expiresAt: number,
  ) {}

  get fencingToken(): number {
    return this.token;
  }

  async renew(now = Date.now()): Promise<Lease> {
    if (this.released) {
      throw new LockUnavailableError(`Lease ${this.key} is already released`);
    }

    const next = await this.store.renewLock(this.key, this.owner, this.token, this.ttlMs, now);
    if (!next) {
      throw new LockUnavailableError(`Lease ${this.key} could not be renewed`);
    }

    return new Lease(this.store, next.key, next.owner, next.token, this.ttlMs, next.expiresAt);
  }

  async release(): Promise<boolean> {
    if (this.released) {
      return false;
    }

    this.released = true;
    return this.store.releaseLock(this.key, this.owner, this.token);
  }
}

export class Mutex {
  constructor(
    readonly store: QueueStore,
    readonly namespace = 'apiary:lock',
  ) {}

  async acquire(key: string, options: LockAcquireOptions = {}): Promise<Lease> {
    const ttl = Math.max(1, options.ttl ?? 30_000);
    const wait = Math.max(0, options.wait ?? 0);
    const interval = Math.max(1, options.retryInterval ?? 25);
    const owner = options.owner ?? crypto.randomUUID();
    const deadline = Date.now() + wait;

    while (true) {
      options.signal?.throwIfAborted();

      const record = await this.store.acquireLock(
        `${this.namespace}:${key}`,
        owner,
        ttl,
        Date.now(),
      );
      if (record) {
        return new Lease(this.store, record.key, record.owner, record.token, ttl, record.expiresAt);
      }

      if (Date.now() >= deadline) {
        throw new LockUnavailableError(`Lock unavailable: ${key}`);
      }

      await sleep(Math.min(interval, Math.max(1, deadline - Date.now())));
    }
  }

  async tryAcquire(
    key: string,
    options: Omit<LockAcquireOptions, 'wait'> = {},
  ): Promise<Lease | null> {
    try {
      return await this.acquire(key, { ...options, wait: 0 });
    } catch (error) {
      if (error instanceof LockUnavailableError) {
        return null;
      }

      throw error;
    }
  }

  async withLock<T>(
    key: string,
    fn: (lease: Lease) => Promise<T> | T,
    options?: LockAcquireOptions,
  ): Promise<T> {
    const lease = await this.acquire(key, options);
    try {
      return await fn(lease);
    } finally {
      await lease.release();
    }
  }
}

export class SemaphorePermit {
  constructor(
    readonly slot: number,
    readonly lease: Lease,
  ) {}

  get fencingToken(): number {
    return this.lease.fencingToken;
  }

  release(): Promise<boolean> {
    return this.lease.release();
  }
}

export class Semaphore {
  private readonly mutex: Mutex;

  constructor(
    readonly store: QueueStore,
    readonly name: string,
    readonly permits: number,
  ) {
    if (!Number.isInteger(permits) || permits <= 0) {
      throw new TypeError('Semaphore permits must be a positive integer');
    }

    this.mutex = new Mutex(store, `apiary:semaphore:${name}`);
  }

  async acquire(options: LockAcquireOptions = {}): Promise<SemaphorePermit> {
    const deadline = Date.now() + Math.max(0, options.wait ?? 0);
    do {
      for (let slot = 0; slot < this.permits; slot++) {
        const lease = await this.mutex.tryAcquire(String(slot), options);
        if (lease) {
          return new SemaphorePermit(slot, lease);
        }
      }

      if (Date.now() >= deadline) {
        break;
      }

      await sleep(options.retryInterval ?? 25);
    } while (true);

    throw new LockUnavailableError(`Semaphore unavailable: ${this.name}`);
  }
}

export class AtomicCounter {
  constructor(
    readonly store: QueueStore,
    readonly key: string,
  ) {}

  increment(amount = 1): Promise<number> {
    return Promise.resolve(this.store.increment(this.key, amount));
  }

  decrement(amount = 1): Promise<number> {
    return this.increment(-amount);
  }

  value(): Promise<number> {
    return Promise.resolve(this.store.getCounter(this.key));
  }
}

export class Barrier {
  private count = 0;
  private generation = 0;
  private waiters: Array<() => void> = [];

  constructor(readonly parties: number) {
    if (!Number.isInteger(parties) || parties <= 0) {
      throw new TypeError('Barrier parties must be positive');
    }
  }

  async arriveAndWait(): Promise<number> {
    const generation = this.generation;
    this.count++;

    if (this.count >= this.parties) {
      this.count = 0;
      this.generation++;

      const waiters = this.waiters.splice(0);
      waiters.forEach((resolve) => resolve());
      return generation;
    }

    await new Promise<void>((resolve) => this.waiters.push(resolve));
    return generation;
  }
}

export class LeaderElector {
  private lease?: Lease;

  constructor(
    readonly mutex: Mutex,
    readonly name: string,
  ) {}

  get isLeader(): boolean {
    return !!this.lease;
  }

  get fencingToken(): number | undefined {
    return this.lease?.fencingToken;
  }

  async campaign(options: LockAcquireOptions = {}): Promise<boolean> {
    this.lease = (await this.mutex.tryAcquire(`leader:${this.name}`, options)) ?? undefined;
    return !!this.lease;
  }

  async renew(): Promise<boolean> {
    if (!this.lease) {
      return false;
    }

    try {
      this.lease = await this.lease.renew();
      return true;
    } catch {
      this.lease = undefined;
      return false;
    }
  }

  async resign(): Promise<void> {
    if (this.lease) {
      await this.lease.release();
    }

    this.lease = undefined;
  }
}

export type { LockAcquireOptions } from './types/atomics.js';
