import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';

import { REDIS_CLIENT } from './redis.tokens';

/**
 * Releasing compares the stored token before deleting, so a holder whose lease
 * already expired cannot delete a lock another worker has since acquired.
 * `DEL` on its own would do exactly that.
 */
const RELEASE = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0
`;

const EXTEND = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('pexpire', KEYS[1], ARGV[2])
end
return 0
`;

export interface LockOptions {
  /** How long the lease survives without renewal. */
  ttlMs?: number;
  /** How long to keep retrying before giving up. Zero fails immediately. */
  waitMs?: number;
  retryDelayMs?: number;
}

export interface Lock {
  key: string;
  token: string;
  extend: (ttlMs?: number) => Promise<boolean>;
  release: () => Promise<void>;
}

/**
 * Single-Redis mutual exclusion. Enough to keep replicas of a scheduled job
 * from all firing at once, which is the case this codebase actually has; it is
 * not a Redlock quorum and should not be relied on for correctness across a
 * Redis failover.
 */
@Injectable()
export class DistributedLockService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async acquire(key: string, options: LockOptions = {}): Promise<Lock | null> {
    const { ttlMs = 30_000, waitMs = 0, retryDelayMs = 100 } = options;
    const namespaced = `lock:${key}`;
    const token = randomUUID();
    const deadline = Date.now() + waitMs;

    do {
      const acquired = await this.redis.set(namespaced, token, 'PX', ttlMs, 'NX');

      if (acquired === 'OK') {
        return {
          key: namespaced,
          token,
          extend: (next = ttlMs) => this.extend(namespaced, token, next),
          release: () => this.release(namespaced, token),
        };
      }

      if (Date.now() >= deadline) break;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    } while (Date.now() < deadline);

    return null;
  }

  /**
   * Runs `fn` only if the lock is free, and always releases it. Returns
   * `undefined` when another holder has it — callers treat that as "someone
   * else is already doing this", not as a failure.
   */
  async withLock<T>(
    key: string,
    fn: () => Promise<T>,
    options?: LockOptions,
  ): Promise<T | undefined> {
    const lock = await this.acquire(key, options);
    if (!lock) return undefined;

    try {
      return await fn();
    } finally {
      await lock.release();
    }
  }

  private async extend(key: string, token: string, ttlMs: number): Promise<boolean> {
    const result = await this.redis.eval(EXTEND, 1, key, token, String(ttlMs));

    return result === 1;
  }

  private async release(key: string, token: string): Promise<void> {
    await this.redis.eval(RELEASE, 1, key, token);
  }
}
