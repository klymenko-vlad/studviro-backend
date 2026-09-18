import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ScheduledSyncRepository } from './scheduled-sync.repository';
import { ScheduledSyncService } from './scheduled-sync.service';
import type { SynchronizationService } from './synchronization.service';

describe('ScheduledSyncService', () => {
  const findConfiguredInstitutions = vi.fn();
  const request = vi.fn();
  const warn = vi.fn();
  const logger = { setContext: vi.fn(), warn } as unknown as PinoLogger;

  let service: ScheduledSyncService;

  beforeEach(() => {
    vi.clearAllMocks();
    findConfiguredInstitutions.mockResolvedValue([]);
    request.mockResolvedValue({ id: 'run-1' });
    service = new ScheduledSyncService(
      { findConfiguredInstitutions } as unknown as ScheduledSyncRepository,
      { request } as unknown as SynchronizationService,
      logger,
    );
  });

  it('queues nothing when no institution has a connector', async () => {
    await expect(service.runAll('incremental')).resolves.toEqual({
      institutions: 0,
      queued: 0,
    });
  });

  it('queues one run per configured source system, marked as scheduled', async () => {
    findConfiguredInstitutions.mockResolvedValue([
      { institutionId: 'institution-1', sourceSystems: ['sis', 'lms'] },
    ]);

    await expect(service.runAll('incremental')).resolves.toEqual({
      institutions: 1,
      queued: 2,
    });
    expect(request).toHaveBeenCalledWith(
      'institution-1',
      'incremental',
      null,
      'sis',
      'scheduled',
    );
  });

  it('carries the mode the schedule asked for', async () => {
    findConfiguredInstitutions.mockResolvedValue([
      { institutionId: 'institution-1', sourceSystems: ['sis'] },
    ]);

    await service.runAll('full');

    expect(request).toHaveBeenCalledWith('institution-1', 'full', null, 'sis', 'scheduled');
  });

  it('does not let one institution’s misconfiguration stop the others', async () => {
    findConfiguredInstitutions.mockResolvedValue([
      { institutionId: 'broken', sourceSystems: ['sis'] },
      { institutionId: 'fine', sourceSystems: ['sis'] },
    ]);
    request.mockRejectedValueOnce(new Error('no connector installed'));

    await expect(service.runAll('incremental')).resolves.toMatchObject({ queued: 1 });
    expect(warn).toHaveBeenCalled();
  });
});
