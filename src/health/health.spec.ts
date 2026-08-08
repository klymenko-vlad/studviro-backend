import type { HealthIndicatorService } from '@nestjs/terminus';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../database/database.module';

import { DatabaseHealthIndicator } from './database.health';
import { QueueHealthIndicator } from './queue.health';

const indicator = () => {
  const up = vi.fn((details?: unknown) => ({ status: 'up', details }));
  const down = vi.fn((details?: unknown) => ({ status: 'down', details }));

  return {
    service: { check: () => ({ up, down }) } as unknown as HealthIndicatorService,
    up,
    down,
  };
};

describe('DatabaseHealthIndicator', () => {
  it('reports up when the ping round-trips', async () => {
    const { service, up } = indicator();
    const db = { execute: vi.fn().mockResolvedValue([]) } as unknown as Database;

    const result = await new DatabaseHealthIndicator(db, service).pingCheck('database');

    expect(result).toMatchObject({ status: 'up' });
    expect(up.mock.calls[0]?.[0]).toHaveProperty('responseTimeMs');
  });

  it('reports down instead of throwing when the query fails', async () => {
    const { service, down } = indicator();
    const db = {
      execute: vi.fn().mockRejectedValue(new Error('connection refused')),
    } as unknown as Database;

    const result = await new DatabaseHealthIndicator(db, service).pingCheck('database');

    expect(result).toMatchObject({ status: 'down' });
    expect(down).toHaveBeenCalledWith({ message: 'connection refused' });
  });

  it('reports down when the ping outlives its timeout', async () => {
    const { service } = indicator();
    const db = {
      execute: vi.fn(() => new Promise(() => undefined)),
    } as unknown as Database;

    const result = await new DatabaseHealthIndicator(db, service).pingCheck('database', 10);

    expect(result).toMatchObject({ status: 'down' });
  });
});

describe('QueueHealthIndicator', () => {
  const queueWith = (counts: Record<string, number>) =>
    ({ getJobCounts: vi.fn().mockResolvedValue(counts) }) as never;

  it('reports up for a healthy backlog', async () => {
    const { service } = indicator();
    const health = new QueueHealthIndicator(queueWith({ waiting: 3 }), service);

    expect(await health.check('queue')).toMatchObject({ status: 'up' });
  });

  it('reports down once the backlog exceeds the limit', async () => {
    const { service } = indicator();
    const health = new QueueHealthIndicator(queueWith({ waiting: 50 }), service);

    expect(await health.check('queue', 10)).toMatchObject({ status: 'down' });
  });

  it('reports down when Redis is unreachable', async () => {
    const { service, down } = indicator();
    const queue = { getJobCounts: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) };

    const result = await new QueueHealthIndicator(queue as never, service).check('queue');

    expect(result).toMatchObject({ status: 'down' });
    expect(down).toHaveBeenCalledWith({ message: 'ECONNREFUSED' });
  });
});
