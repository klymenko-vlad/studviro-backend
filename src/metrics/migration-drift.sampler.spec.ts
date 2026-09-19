import type { PinoLogger } from 'nestjs-pino';
import type { Gauge } from 'prom-client';
import { describe, expect, it, vi } from 'vitest';

import type { MigrationsHealthIndicator } from '../health/migrations.health';

import { MigrationDriftSampler } from './migration-drift.sampler';

describe('MigrationDriftSampler', () => {
  const applied = { set: vi.fn() };
  const expected = { set: vi.fn() };
  const logger = { setContext: vi.fn(), warn: vi.fn() };

  const sampler = (counts: () => Promise<{ applied: number; expected: number }>) =>
    new MigrationDriftSampler(
      { counts } as unknown as MigrationsHealthIndicator,
      applied as unknown as Gauge,
      expected as unknown as Gauge,
      logger as unknown as PinoLogger,
    );

  it('publishes both sides of the comparison, so the gap is derivable', async () => {
    await sampler(() => Promise.resolve({ applied: 41, expected: 42 })).sample();

    expect(applied.set).toHaveBeenCalledWith(41);
    expect(expected.set).toHaveBeenCalledWith(42);
  });

  it('leaves the last values in place when the database cannot be read', async () => {
    await expect(
      sampler(() => Promise.reject(new Error('permission denied'))).sample(),
    ).resolves.toBeUndefined();

    expect(applied.set).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });
});
