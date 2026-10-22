import type { PinoLogger } from 'nestjs-pino';
import type { Gauge } from 'prom-client';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../database/database.tokens';

import { InstitutionCountSampler } from './institution-count.sampler';

describe('InstitutionCountSampler', () => {
  const gauge = { set: vi.fn() };
  const logger = { setContext: vi.fn(), warn: vi.fn() };

  const dbReturning = (rows: unknown) =>
    ({
      select: () => ({ from: () => ({ where: () => Promise.resolve(rows) }) }),
    }) as unknown as Database;

  const dbRejecting = () =>
    ({
      select: () => ({
        from: () => ({ where: () => Promise.reject(new Error('connection refused')) }),
      }),
    }) as unknown as Database;

  const sampler = (db: Database) =>
    new InstitutionCountSampler(db, gauge as unknown as Gauge, logger as unknown as PinoLogger);

  it('publishes the count of institutions still present', async () => {
    await sampler(dbReturning([{ total: 3 }])).sample();

    expect(gauge.set).toHaveBeenCalledWith(3);
  });

  it('publishes zero rather than nothing on an empty platform', async () => {
    await sampler(dbReturning([])).sample();

    expect(gauge.set).toHaveBeenCalledWith(0);
  });

  it('leaves the last value in place when the query fails', async () => {
    await expect(sampler(dbRejecting()).sample()).resolves.toBeUndefined();

    expect(gauge.set).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });
});
