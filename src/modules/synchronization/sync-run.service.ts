import { Injectable } from '@nestjs/common';

import type {
  SyncRun,
  SyncRunMode,
  SyncRunStatus,
  SyncRunTrigger,
} from '../../database/schema';

import { SyncDomainResultRepository } from './sync-domain-result.repository';
import { SyncRunRepository } from './sync-run.repository';
import { SyncWatermarkRepository } from './sync-watermark.repository';
import { addCounts, emptyCounts, type DomainOutcome, type SyncTarget } from './sync.types';

export interface SyncRunRequest {
  readonly mode: SyncRunMode;
  readonly trigger: SyncRunTrigger;
  readonly requestedById: string | null;
}

function runStatus(outcomes: readonly DomainOutcome[]): SyncRunStatus {
  const attempted = outcomes.filter((outcome) => outcome.status !== 'skipped');
  const succeeded = attempted.filter((outcome) => outcome.status === 'succeeded');

  if (succeeded.length === attempted.length) return 'succeeded';
  if (succeeded.length === 0) return 'failed';

  return 'partial';
}

@Injectable()
export class SyncRunService {
  constructor(
    private readonly runs: SyncRunRepository,
    private readonly domainResults: SyncDomainResultRepository,
    private readonly watermarks: SyncWatermarkRepository,
  ) {}

  create(target: SyncTarget, request: SyncRunRequest): Promise<SyncRun> {
    return this.runs.create({
      institutionId: target.institutionId,
      sourceSystem: target.sourceSystem,
      connectorName: target.connectorName,
      mode: request.mode,
      trigger: request.trigger,
      requestedById: request.requestedById,
      status: 'queued',
      queuedAt: new Date(),
    });
  }

  markRunning(runId: string, startedAt: Date): Promise<SyncRun> {
    return this.runs.update(runId, { status: 'running', startedAt });
  }

  async recordDomain(run: SyncRun, outcome: DomainOutcome): Promise<void> {
    await this.domainResults.record({
      institutionId: run.institutionId,
      runId: run.id,
      domain: outcome.domain,
      status: outcome.status,
      fetched: outcome.fetched,
      created: outcome.created,
      updated: outcome.updated,
      deleted: outcome.deleted,
      skipped: outcome.skipped,
      failed: outcome.failed,
      watermark: outcome.watermark,
      durationMs: outcome.durationMs,
      errorMessage: outcome.errorMessage,
    });

    if (outcome.status === 'skipped') return;

    const attemptedAt = new Date();

    await this.watermarks.record({
      institutionId: run.institutionId,
      sourceSystem: run.sourceSystem,
      domain: outcome.domain,
      connectorName: run.connectorName,
      sourceUpdatedAt: outcome.watermark,
      lastRunId: run.id,
      lastStatus: outcome.status,
      lastAttemptedAt: attemptedAt,
      lastErrorMessage: outcome.errorMessage,
      ...(outcome.status === 'succeeded' ? { lastSucceededAt: attemptedAt } : {}),
    });
  }

  finish(runId: string, outcomes: readonly DomainOutcome[]): Promise<SyncRun> {
    const totals = outcomes.reduce(addCounts, emptyCounts());

    return this.runs.update(runId, {
      status: runStatus(outcomes),
      finishedAt: new Date(),
      ...totals,
    });
  }

  fail(runId: string, code: string, message: string): Promise<SyncRun> {
    return this.runs.update(runId, {
      status: 'failed',
      finishedAt: new Date(),
      errorCode: code,
      errorMessage: message,
    });
  }
}
