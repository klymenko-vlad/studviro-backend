import { describe, expect, it, vi } from 'vitest';

import { PgErrorCode } from './repository/database-error';
import { retryOnSerializationFailure } from './serializable-retry';

const driverError = (code: string): Error => Object.assign(new Error('conflict'), { code });

const noWait = { sleep: () => Promise.resolve(), random: () => 0.5 };

describe('retryOnSerializationFailure', () => {
  it('returns the first result when nothing conflicts', async () => {
    const work = vi.fn().mockResolvedValue('place held');

    await expect(retryOnSerializationFailure(work, noWait)).resolves.toBe('place held');
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('replays the work when the transaction lost a serialisation race', async () => {
    const work = vi
      .fn()
      .mockRejectedValueOnce(driverError(PgErrorCode.SerializationFailure))
      .mockResolvedValue('place held');

    await expect(retryOnSerializationFailure(work, noWait)).resolves.toBe('place held');
    expect(work).toHaveBeenCalledTimes(2);
  });

  it('replays a deadlock too', async () => {
    const work = vi
      .fn()
      .mockRejectedValueOnce(driverError(PgErrorCode.DeadlockDetected))
      .mockResolvedValue('place held');

    await expect(retryOnSerializationFailure(work, noWait)).resolves.toBe('place held');
    expect(work).toHaveBeenCalledTimes(2);
  });

  it('digs the code out of a wrapping error, as Drizzle raises it', async () => {
    const wrapped = new Error('query failed', {
      cause: driverError(PgErrorCode.SerializationFailure),
    });
    const work = vi.fn().mockRejectedValueOnce(wrapped).mockResolvedValue('place held');

    await expect(retryOnSerializationFailure(work, noWait)).resolves.toBe('place held');
    expect(work).toHaveBeenCalledTimes(2);
  });

  it('gives up after the last attempt and rethrows the conflict', async () => {
    const conflict = driverError(PgErrorCode.SerializationFailure);
    const work = vi.fn().mockRejectedValue(conflict);

    await expect(retryOnSerializationFailure(work, { ...noWait, attempts: 3 })).rejects.toBe(
      conflict,
    );
    expect(work).toHaveBeenCalledTimes(3);
  });

  it('runs exactly once when asked for a single attempt', async () => {
    const conflict = driverError(PgErrorCode.SerializationFailure);
    const work = vi.fn().mockRejectedValue(conflict);

    await expect(retryOnSerializationFailure(work, { ...noWait, attempts: 1 })).rejects.toBe(
      conflict,
    );
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('does not replay a refusal the caller meant — a full course stays full', async () => {
    const full = new Error('OFFERING_FULL');
    const work = vi.fn().mockRejectedValue(full);

    await expect(retryOnSerializationFailure(work, noWait)).rejects.toBe(full);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('does not replay an unrelated driver error', async () => {
    const violation = driverError(PgErrorCode.UniqueViolation);
    const work = vi.fn().mockRejectedValue(violation);

    await expect(retryOnSerializationFailure(work, noWait)).rejects.toBe(violation);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('backs off further on each attempt, and never beyond the ceiling', async () => {
    const delays: number[] = [];
    const work = vi.fn().mockRejectedValue(driverError(PgErrorCode.SerializationFailure));

    await expect(
      retryOnSerializationFailure(work, {
        attempts: 5,
        baseDelayMs: 10,
        maxDelayMs: 25,
        random: () => 1,
        sleep: (ms) => {
          delays.push(ms);

          return Promise.resolve();
        },
      }),
    ).rejects.toThrow();

    expect(delays).toEqual([10, 20, 25, 25]);
  });

  it('spreads the herd by scaling each wait by the random draw', async () => {
    const delays: number[] = [];
    const work = vi
      .fn()
      .mockRejectedValueOnce(driverError(PgErrorCode.SerializationFailure))
      .mockResolvedValue('place held');

    await retryOnSerializationFailure(work, {
      baseDelayMs: 40,
      random: () => 0.25,
      sleep: (ms) => {
        delays.push(ms);

        return Promise.resolve();
      },
    });

    expect(delays).toEqual([10]);
  });
});
