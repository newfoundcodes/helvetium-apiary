export interface LockAcquireOptions {
  ttl?: number;
  wait?: number;
  retryInterval?: number;
  owner?: string;
  signal?: AbortSignal;
}
