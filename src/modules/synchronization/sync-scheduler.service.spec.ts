import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppConfigService, SyncScheduleConfig } from '../../config/app-config.service';
import type { QueueProducer } from '../../queue/queue.producer';

import { SyncSchedulerService } from './sync-scheduler.service';

describe('SyncSchedulerService', () => {
  const scheduleSynchronization = vi.fn();
  const removeSynchronizationSchedule = vi.fn();
  const logger = { setContext: vi.fn(), info: vi.fn() } as unknown as PinoLogger;

  const build = (syncSchedule: SyncScheduleConfig) =>
    new SyncSchedulerService(
      { syncSchedule } as unknown as AppConfigService,
      {
        scheduleSynchronization,
        removeSynchronizationSchedule,
      } as unknown as QueueProducer,
      logger,
    );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers the repeatable job with the cadence and mode configured', async () => {
    await build({
      enabled: true,
      cron: '0 3 * * *',
      mode: 'incremental',
    }).onApplicationBootstrap();

    expect(scheduleSynchronization).toHaveBeenCalledWith('0 3 * * *', 'incremental');
  });

  it('removes an existing schedule when it is turned off, rather than merely not adding one', async () => {
    await build({
      enabled: false,
      cron: '0 3 * * *',
      mode: 'incremental',
    }).onApplicationBootstrap();

    expect(removeSynchronizationSchedule).toHaveBeenCalled();
    expect(scheduleSynchronization).not.toHaveBeenCalled();
  });

  it('carries a full-run cadence through', async () => {
    await build({ enabled: true, cron: '0 4 * * 0', mode: 'full' }).onApplicationBootstrap();

    expect(scheduleSynchronization).toHaveBeenCalledWith('0 4 * * 0', 'full');
  });
});
