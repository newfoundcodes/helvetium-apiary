import type { BackoffStrategy } from './types/jobs.js';

export function computeBackoff(
  strategy: BackoffStrategy,
  attempt: number,
  random: () => number = Math.random,
): number {
  if (typeof strategy === 'number') {
    return Math.max(0, strategy);
  }

  const base = Math.max(0, strategy.delay);
  const factor = strategy.factor ?? 2;

  let delay = base;
  if (strategy.type === 'linear') {
    delay = base * Math.max(1, attempt);
  } else if (strategy.type === 'exponential') {
    delay = base * Math.pow(factor, Math.max(0, attempt - 1));
  }

  if (strategy.maxDelay !== undefined) {
    delay = Math.min(delay, Math.max(0, strategy.maxDelay));
  }

  const jitter = Math.min(1, Math.max(0, strategy.jitter ?? 0));
  if (jitter > 0) {
    delay *= 1 - jitter + random() * jitter * 2;
  }

  return Math.max(0, Math.round(delay));
}
