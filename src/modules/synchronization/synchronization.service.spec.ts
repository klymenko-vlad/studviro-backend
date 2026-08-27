import { describe, expect, it, vi } from 'vitest';

import { InvalidInputError } from '../../common/errors/domain.error';
import type { SyncRun } from '../../database/schema';
import type { QueueProducer } from '../../queue/queue.producer';
import type { ConnectorRegistry } from '../connectors/connector-registry.service';
import type { InstitutionConfigurationService } from '../institutions/configuration/institution-configuration.service';

import type { SyncDomainResultRepository } from './sync-domain-result.repository';
import type { SyncRunRepository } from './sync-run.repository';
import type { SyncRunService } from './sync-run.service';
import type { SyncWatermarkRepository } from './sync-watermark.repository';
import { SynchronizationService } from './synchronization.service';

const INSTITUTION = '11111111-1111-1111-1111-111111111111';

function serviceWith(options: {
  academicSystem?: string | null;
  installed?: boolean;
  inFlight?: SyncRun;
}) {
  const configuration = {
    resolve: vi.fn().mockResolvedValue({
      connectors: { academicSystem: options.academicSystem ?? null, learningSystem: null },
    }),
  };
  const registry = {
    academicSystem: vi.fn().mockReturnValue(options.installed === false ? undefined : {}),
  };
  const runs = {
    create: vi.fn().mockResolvedValue({ id: 'run-1', institutionId: INSTITUTION }),
  };
  const runRepository = { findOneIn: vi.fn().mockResolvedValue(options.inFlight) };
  const queue = { enqueueSynchronization: vi.fn().mockResolvedValue('job-1') };

  return {
    runs,
    queue,
    service: new SynchronizationService(
      configuration as unknown as InstitutionConfigurationService,
      registry as unknown as ConnectorRegistry,
      runs as unknown as SyncRunService,
      runRepository as unknown as SyncRunRepository,
      {} as SyncDomainResultRepository,
      {} as SyncWatermarkRepository,
      queue as unknown as QueueProducer,
    ),
  };
}

describe('SynchronizationService', () => {
  it('queues a run against the connector the institution is pointed at', async () => {
    const { service, runs, queue } = serviceWith({ academicSystem: 'mock-sis' });

    const run = await service.request(INSTITUTION, 'incremental', 'user-1');

    expect(runs.create).toHaveBeenCalledWith(
      { institutionId: INSTITUTION, sourceSystem: 'sis', connectorName: 'mock-sis' },
      { mode: 'incremental', trigger: 'manual', requestedById: 'user-1' },
    );
    expect(queue.enqueueSynchronization).toHaveBeenCalledWith('academic', {
      runId: 'run-1',
      institutionId: INSTITUTION,
    });
    expect(run.id).toBe('run-1');
  });

  it('returns the run already in flight instead of importing the same data twice', async () => {
    const inFlight = { id: 'run-0', status: 'running' } as SyncRun;
    const { service, runs, queue } = serviceWith({
      academicSystem: 'mock-sis',
      inFlight,
    });

    await expect(service.request(INSTITUTION, 'full', null)).resolves.toBe(inFlight);
    expect(runs.create).not.toHaveBeenCalled();
    expect(queue.enqueueSynchronization).not.toHaveBeenCalled();
  });

  it('refuses when the institution has no academic connector configured', async () => {
    const { service } = serviceWith({ academicSystem: null });

    await expect(service.request(INSTITUTION, 'incremental', null)).rejects.toMatchObject({
      code: 'SYNC_CONNECTOR_NOT_CONFIGURED',
    });
  });

  it('refuses when the configured connector is not installed in this deployment', async () => {
    const { service } = serviceWith({ academicSystem: 'ais2', installed: false });

    const failure = service.request(INSTITUTION, 'incremental', null);

    await expect(failure).rejects.toBeInstanceOf(InvalidInputError);
    await expect(failure).rejects.toMatchObject({ code: 'SYNC_CONNECTOR_NOT_INSTALLED' });
  });
});
