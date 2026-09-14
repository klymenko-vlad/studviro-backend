import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import type { Lock } from '../../common/redis/distributed-lock.service';
import { DistributedLockService } from '../../common/redis/distributed-lock.service';
import type { SyncRun } from '../../database/schema';
import { ConnectorRegistry } from '../connectors/connector-registry.service';
import type { LearningSystemConnector } from '../connectors/learning-system.connector';
import { ExternalIdentitiesRepository } from '../identity/external-identities.repository';

import { SyncAlreadyRunningError } from './academic-sync.service';
import { CanonicalRepositories } from './canonical.repositories';
import { DomainSynchronizer } from './domain-synchronizer';
import { LEARNING_IMPORTERS, type LearningImporter } from './importers/learning.importer';
import { SyncRunRepository } from './sync-run.repository';
import { SyncRunService } from './sync-run.service';
import { SyncSession } from './sync-session';
import { SyncWatermarkRepository } from './sync-watermark.repository';
import type { DomainOutcome } from './sync.types';

const LOCK_TTL_MS = 120_000;

@Injectable()
export class LearningSyncService {
  constructor(
    private readonly registry: ConnectorRegistry,
    private readonly runs: SyncRunService,
    private readonly runRepository: SyncRunRepository,
    private readonly watermarks: SyncWatermarkRepository,
    private readonly repositories: CanonicalRepositories,
    private readonly identities: ExternalIdentitiesRepository,
    private readonly domains: DomainSynchronizer,
    private readonly locks: DistributedLockService,
    @Inject(LEARNING_IMPORTERS) private readonly importers: readonly LearningImporter[],
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LearningSyncService.name);
  }

  async execute(runId: string): Promise<SyncRun> {
    const run = await this.runRepository.findByIdOrFail(runId, { consistent: true });
    if (run.status !== 'queued' && run.status !== 'running') return run;

    const connector = this.registry.learningSystem(run.connectorName);
    if (!connector) {
      return this.runs.fail(
        run.id,
        'SYNC_CONNECTOR_MISSING',
        `No learning connector named "${run.connectorName}" is installed`,
      );
    }

    const lock = await this.locks.acquire(`sync:learning:${run.institutionId}`, {
      ttlMs: LOCK_TTL_MS,
    });
    if (!lock) throw new SyncAlreadyRunningError(run.institutionId);

    try {
      return await this.drain(run, connector, lock);
    } catch (error) {
      this.logger.error({ err: error, runId: run.id }, 'learning synchronization run aborted');

      return await this.runs.fail(
        run.id,
        'SYNC_RUN_ABORTED',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      await lock.release();
    }
  }

  private async drain(
    run: SyncRun,
    connector: LearningSystemConnector,
    lock: Lock,
  ): Promise<SyncRun> {
    const startedAt = new Date();
    await this.runs.markRunning(run.id, startedAt);

    const session = new SyncSession(
      {
        institutionId: run.institutionId,
        sourceSystem: run.sourceSystem,
        connectorName: run.connectorName,
      },
      this.repositories,
      this.identities,
      startedAt,
    );

    const capabilities = connector.capabilities();
    const outcomes: DomainOutcome[] = [];

    for (const importer of this.importers) {
      const outcome = capabilities[importer.capability]
        ? await this.domains.run(
            importer,
            connector,
            session,
            await this.watermarkOf(run, importer),
          )
        : this.domains.skipped(importer.domain);

      await this.runs.recordDomain(run, outcome);
      outcomes.push(outcome);
      await lock.extend();
    }

    const finished = await this.runs.finish(run.id, outcomes);
    this.logger.info(
      { runId: run.id, status: finished.status, created: finished.created },
      'learning synchronization run finished',
    );

    return finished;
  }

  private async watermarkOf(run: SyncRun, importer: LearningImporter): Promise<Date | null> {
    if (run.mode === 'full') return null;

    const stored = await this.watermarks.findFor(
      run.institutionId,
      run.sourceSystem,
      importer.domain,
    );

    return stored?.sourceUpdatedAt ?? null;
  }
}
