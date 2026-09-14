import { Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';

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

import type { SynchronizedSourceSystem } from './dto/start-sync-run.dto';
import { SyncDomainResultRepository } from './sync-domain-result.repository';
import { SyncRunRepository } from './sync-run.repository';
import { SyncRunService } from './sync-run.service';
import { SyncWatermarkRepository } from './sync-watermark.repository';

const ACADEMIC_SOURCE: SourceSystem = 'sis';
const LEARNING_SOURCE: SourceSystem = 'lms';
const IN_FLIGHT = ['queued', 'running'] as const;

const SOURCES = {
  sis: {
    system: ACADEMIC_SOURCE,
    job: 'academic',
    label: 'academic system',
    setting: 'academicSystem',
  },
  lms: {
    system: LEARNING_SOURCE,
    job: 'learning',
    label: 'learning system',
    setting: 'learningSystem',
  },
} as const satisfies Record<SynchronizedSourceSystem, unknown>;

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
    sourceSystem: SynchronizedSourceSystem = 'sis',
  ): Promise<SyncRun> {
    const source = SOURCES[sourceSystem];
    const connectorName = await this.connectorName(institutionId, sourceSystem);

    const inFlight = await this.runRepository.findOneIn(
      institutionId,
      and(eq(syncRuns.sourceSystem, source.system), inArray(syncRuns.status, [...IN_FLIGHT])),
      { consistent: true },
    );
    if (inFlight) return inFlight;

    const run = await this.runs.create(
      { institutionId, sourceSystem: source.system, connectorName },
      { mode, trigger: 'manual', requestedById },
    );

    await this.queue.enqueueSynchronization(source.job, {
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

  async listWatermarks(institutionId: string): Promise<SyncWatermark[]> {
    const [academic, learning] = await Promise.all([
      this.watermarks.findAllFor(institutionId, ACADEMIC_SOURCE),
      this.watermarks.findAllFor(institutionId, LEARNING_SOURCE),
    ]);

    return [...academic, ...learning];
  }

  private async connectorName(
    institutionId: string,
    sourceSystem: SynchronizedSourceSystem,
  ): Promise<string> {
    const source = SOURCES[sourceSystem];
    const { connectors } = await this.configuration.resolve(institutionId);
    const name = connectors[source.setting];

    if (!name) {
      throw new InvalidInputError(
        'SYNC_CONNECTOR_NOT_CONFIGURED',
        `This institution has no ${source.label} connector configured`,
      );
    }

    const installed =
      sourceSystem === 'sis'
        ? this.registry.academicSystem(name)
        : this.registry.learningSystem(name);

    if (!installed) {
      throw new InvalidInputError(
        'SYNC_CONNECTOR_NOT_INSTALLED',
        `No ${source.label} connector named "${name}" is installed`,
        { connectorName: name },
      );
    }

    return name;
  }
}
