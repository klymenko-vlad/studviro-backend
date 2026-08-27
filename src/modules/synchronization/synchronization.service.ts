import { Injectable } from '@nestjs/common';
import { inArray } from 'drizzle-orm';

import { InvalidInputError } from '../../common/errors/domain.error';
import {
  syncRuns,
  type SourceSystem,
  type SyncDomainResult,
  type SyncRun,
  type SyncRunMode,
  type SyncWatermark,
} from '../../database/schema';
import { QueueProducer } from '../../queue/queue.producer';
import { ConnectorRegistry } from '../connectors/connector-registry.service';
import { InstitutionConfigurationService } from '../institutions/configuration/institution-configuration.service';

import { SyncDomainResultRepository } from './sync-domain-result.repository';
import { SyncRunRepository } from './sync-run.repository';
import { SyncRunService } from './sync-run.service';
import { SyncWatermarkRepository } from './sync-watermark.repository';

const ACADEMIC_SOURCE: SourceSystem = 'sis';
const IN_FLIGHT = ['queued', 'running'] as const;

export interface SyncRunDetail {
  readonly run: SyncRun;
  readonly domains: SyncDomainResult[];
}

@Injectable()
export class SynchronizationService {
  constructor(
    private readonly configuration: InstitutionConfigurationService,
    private readonly registry: ConnectorRegistry,
    private readonly runs: SyncRunService,
    private readonly runRepository: SyncRunRepository,
    private readonly domainResults: SyncDomainResultRepository,
    private readonly watermarks: SyncWatermarkRepository,
    private readonly queue: QueueProducer,
  ) {}

  async request(
    institutionId: string,
    mode: SyncRunMode,
    requestedById: string | null,
  ): Promise<SyncRun> {
    const connectorName = await this.academicConnectorName(institutionId);

    const inFlight = await this.runRepository.findOneIn(
      institutionId,
      inArray(syncRuns.status, [...IN_FLIGHT]),
      { consistent: true },
    );
    if (inFlight) return inFlight;

    const run = await this.runs.create(
      { institutionId, sourceSystem: ACADEMIC_SOURCE, connectorName },
      { mode, trigger: 'manual', requestedById },
    );

    await this.queue.enqueueSynchronization('academic', {
      runId: run.id,
      institutionId,
    });

    return run;
  }

  listRuns(institutionId: string, limit: number): Promise<SyncRun[]> {
    return this.runRepository.findRecent(institutionId, limit);
  }

  async findRun(institutionId: string, runId: string): Promise<SyncRunDetail> {
    const run = await this.runRepository.findByIdInOrFail(institutionId, runId, {
      consistent: true,
    });

    return { run, domains: await this.domainResults.findForRun(run.id) };
  }

  listWatermarks(institutionId: string): Promise<SyncWatermark[]> {
    return this.watermarks.findAllFor(institutionId, ACADEMIC_SOURCE);
  }

  private async academicConnectorName(institutionId: string): Promise<string> {
    const { connectors } = await this.configuration.resolve(institutionId);
    const name = connectors.academicSystem;

    if (!name) {
      throw new InvalidInputError(
        'SYNC_CONNECTOR_NOT_CONFIGURED',
        'This institution has no academic system connector configured',
      );
    }

    if (!this.registry.academicSystem(name)) {
      throw new InvalidInputError(
        'SYNC_CONNECTOR_NOT_INSTALLED',
        `No academic connector named "${name}" is installed`,
        { connectorName: name },
      );
    }

    return name;
  }
}
