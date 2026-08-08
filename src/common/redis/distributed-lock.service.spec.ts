import type Redis from 'ioredis';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DistributedLockService } from './distributed-lock.service';

describe('DistributedLockService', () => {
  const redis = { set: vi.fn(), eval: vi.fn() };
  const service = new DistributedLockService(redis as unknown as Redis);

  beforeEach(() => {
    vi.clearAllMocks();
    redis.eval.mockResolvedValue(1);
  });

  it('acquires with NX and a TTL, so a crashed holder cannot hold it forever', async () => {
    redis.set.mockResolvedValue('OK');

    const lock = await service.acquire('cleanup', { ttlMs: 5_000 });

    expect(lock).not.toBeNull();
    expect(redis.set).toHaveBeenCalledWith(
      'lock:cleanup',
      expect.any(String),
      'PX',
      5_000,
      'NX',
    );
  });

  it('returns null immediately when the lock is held and no wait is allowed', async () => {
    redis.set.mockResolvedValue(null);

    await expect(service.acquire('cleanup')).resolves.toBeNull();
    expect(redis.set).toHaveBeenCalledTimes(1);
  });

  it('retries until the deadline, then gives up', async () => {
    redis.set.mockResolvedValue(null);

    const lock = await service.acquire('cleanup', { waitMs: 30, retryDelayMs: 10 });

    expect(lock).toBeNull();
    expect(redis.set.mock.calls.length).toBeGreaterThan(1);
  });

  it('acquires on a later attempt once the holder releases', async () => {
    redis.set.mockResolvedValueOnce(null).mockResolvedValueOnce('OK');

    await expect(
      service.acquire('cleanup', { waitMs: 100, retryDelayMs: 5 }),
    ).resolves.not.toBeNull();
  });

  it('releases with a token comparison rather than a bare DEL', async () => {
    redis.set.mockResolvedValue('OK');
    const lock = await service.acquire('cleanup');

    await lock!.release();

    // A plain DEL would let a holder whose lease already expired delete a lock
    // that another worker has since taken.
    const [script, keyCount, key, token] = redis.eval.mock.calls[0]!;
    expect(script).toContain("redis.call('get', KEYS[1]) == ARGV[1]");
    expect(keyCount).toBe(1);
    expect(key).toBe('lock:cleanup');
    expect(token).toBe(lock!.token);
  });

  it('extends only while the caller still owns the lease', async () => {
    redis.set.mockResolvedValue('OK');
    const lock = await service.acquire('cleanup');

    redis.eval.mockResolvedValueOnce(1);
    await expect(lock!.extend(1_000)).resolves.toBe(true);

    redis.eval.mockResolvedValueOnce(0);
    await expect(lock!.extend(1_000)).resolves.toBe(false);
  });

  describe('withLock', () => {
    it('runs the callback and releases afterwards', async () => {
      redis.set.mockResolvedValue('OK');
      const work = vi.fn().mockResolvedValue('done');

      await expect(service.withLock('cleanup', work)).resolves.toBe('done');
      expect(work).toHaveBeenCalledOnce();
      expect(redis.eval).toHaveBeenCalledOnce();
    });

    it('skips the callback when another holder has the lock', async () => {
      redis.set.mockResolvedValue(null);
      const work = vi.fn();

      await expect(service.withLock('cleanup', work)).resolves.toBeUndefined();
      expect(work).not.toHaveBeenCalled();
    });

    it('releases even when the callback throws', async () => {
      redis.set.mockResolvedValue('OK');

      await expect(
        service.withLock('cleanup', () => Promise.reject(new Error('boom'))),
      ).rejects.toThrow('boom');
      expect(redis.eval).toHaveBeenCalledOnce();
    });
  });
});
