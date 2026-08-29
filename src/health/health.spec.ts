import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { HealthIndicatorService } from '@nestjs/terminus';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../database/database.module';

import { DatabaseHealthIndicator } from './database.health';
import { MigrationsHealthIndicator } from './migrations.health';
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

describe('MigrationsHealthIndicator', () => {
  const dbApplying = (applied: number) =>
    ({ execute: vi.fn().mockResolvedValue([{ applied }]) }) as unknown as Database;

  /** Every migration in `drizzle/` is expected, so the journal is the yardstick. */
  const expected = (
    JSON.parse(readFileSync(resolve(process.cwd(), 'drizzle/meta/_journal.json'), 'utf8')) as {
      entries: unknown[];
    }
  ).entries.length;

  it('reports up when every shipped migration has been applied', async () => {
    const { service, up } = indicator();

    const result = await new MigrationsHealthIndicator(dbApplying(expected), service).check(
      'migrations',
    );

    expect(result).toMatchObject({ status: 'up' });
    expect(up).toHaveBeenCalledWith({ applied: expected, expected });
  });

  it('reports down on a database that has never been migrated', async () => {
    const { service, down } = indicator();

    const result = await new MigrationsHealthIndicator(dbApplying(0), service).check(
      'migrations',
    );

    expect(result).toMatchObject({ status: 'down' });
    expect(down.mock.calls[0]?.[0]).toMatchObject({ applied: 0, expected });
  });

  it('reports down when the instance runs ahead of its database', async () => {
    const { service } = indicator();

    const result = await new MigrationsHealthIndicator(dbApplying(expected - 1), service).check(
      'migrations',
    );

    expect(result).toMatchObject({ status: 'down' });
  });

  it('reports down rather than throwing when the count cannot be read', async () => {
    const { service, down } = indicator();
    const db = {
      execute: vi.fn().mockRejectedValue(new Error('permission denied')),
    } as unknown as Database;

    const result = await new MigrationsHealthIndicator(db, service).check('migrations');

    expect(result).toMatchObject({ status: 'down' });
    expect(down).toHaveBeenCalledWith({ message: 'permission denied' });
  });
});
