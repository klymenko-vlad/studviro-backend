import type { Queue } from 'bullmq';
import type { PinoLogger } from 'nestjs-pino';
import type { Gauge } from 'prom-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { QueueDepthSampler } from './queue-depth.sampler';

describe('QueueDepthSampler', () => {
  type SetGauge = (labels: { queue: string }, value: number) => void;

  const waiting = { set: vi.fn<SetGauge>() };
  const oldest = { set: vi.fn<SetGauge>() };
  const logger = { setContext: vi.fn(), warn: vi.fn() };

  const emptyQueue = () =>
    ({
      getWaitingCount: vi.fn().mockResolvedValue(0),
      getWaiting: vi.fn().mockResolvedValue([]),
    }) as unknown as Queue;

  const samplerWithEmail = (email: Queue) =>
    new QueueDepthSampler(
      email,
      emptyQueue(),
      emptyQueue(),
      waiting as unknown as Gauge<'queue'>,
      oldest as unknown as Gauge<'queue'>,
      logger as unknown as PinoLogger,
    );

  beforeEach(() => {
    vi.useRealTimers();
  });

  it('reads the tail of the wait list, where the oldest job sits', async () => {
    const getWaiting = vi.fn().mockResolvedValue([{ timestamp: Date.now() - 90_000 }]);
    const email = {
      getWaitingCount: vi.fn().mockResolvedValue(4),
      getWaiting,
    } as unknown as Queue;

    await samplerWithEmail(email).sample();

    expect(getWaiting).toHaveBeenCalledWith(-1, -1);
    expect(waiting.set).toHaveBeenCalledWith({ queue: 'email' }, 4);
    expect(oldest.set.mock.calls.find(([labels]) => labels.queue === 'email')?.[1]).toBeCloseTo(
      90,
      0,
    );
  });

  it('reports an age of zero for an empty queue', async () => {
    await samplerWithEmail(emptyQueue()).sample();

    expect(oldest.set).toHaveBeenCalledWith({ queue: 'email' }, 0);
  });

  it('never reports a negative age for a job timestamped in the future', async () => {
    const email = {
      getWaitingCount: vi.fn().mockResolvedValue(1),
      getWaiting: vi.fn().mockResolvedValue([{ timestamp: Date.now() + 60_000 }]),
    } as unknown as Queue;

    await samplerWithEmail(email).sample();

    expect(oldest.set).toHaveBeenCalledWith({ queue: 'email' }, 0);
  });

  it('samples every queue, not only the first', async () => {
    await samplerWithEmail(emptyQueue()).sample();

    expect(waiting.set.mock.calls.map(([labels]) => labels.queue).sort()).toEqual([
      'email',
      'maintenance',
      'media',
    ]);
  });

  it('logs and carries on when the broker is unreachable', async () => {
    const email = {
      getWaitingCount: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      getWaiting: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    } as unknown as Queue;

    await expect(samplerWithEmail(email).sample()).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalled();
    expect(waiting.set).not.toHaveBeenCalledWith({ queue: 'email' }, expect.anything());
  });
});
