import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import type { SyncDomain, SyncDomainStatus } from '../../database/schema';
import type { ConnectorRecord } from '../connectors/connector.types';

import type { SourceImporter } from './importers/source.importer';
import type { SyncSession } from './sync-session';
import { emptyCounts, type DomainOutcome, type RecordCounts } from './sync.types';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function statusOf(counts: RecordCounts): SyncDomainStatus {
  if (counts.failed === 0) return 'succeeded';

  return counts.created + counts.updated + counts.deleted > 0 ? 'partial' : 'failed';
}

@Injectable()
export class DomainSynchronizer {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(DomainSynchronizer.name);
  }

  async run<TConnector>(
    importer: SourceImporter<TConnector, string>,
    connector: TConnector,
    session: SyncSession,
    changedSince: Date | null,
  ): Promise<DomainOutcome> {
    const startedAt = performance.now();
    const counts = emptyCounts();

    let records: ConnectorRecord<unknown>[];
    try {
      records = await importer.fetch(connector, changedSince ? { changedSince } : {});
    } catch (error) {
      return this.outcome(importer.domain, counts, 'failed', changedSince, startedAt, error);
    }

    counts.fetched = records.length;
    let highest = changedSince;
    let firstError: unknown;

    for (const record of records) {
      try {
        counts[await importer.apply(record, session)] += 1;
        if (!highest || record.sourceUpdatedAt > highest) highest = record.sourceUpdatedAt;
      } catch (error) {
        counts.failed += 1;
        firstError ??= error;
        this.logger.warn(
          { err: error, domain: importer.domain, externalId: record.externalId },
          'record rejected during synchronization',
        );
      }
    }

    // A failed record must be offered again next run, so the watermark stays
    // where it was rather than moving past the records that did apply.
    const watermark = counts.failed === 0 ? highest : changedSince;

    return this.outcome(
      importer.domain,
      counts,
      statusOf(counts),
      watermark,
      startedAt,
      firstError,
    );
  }

  skipped(domain: SyncDomain): DomainOutcome {
    return {
      domain,
      status: 'skipped',
      watermark: null,
      durationMs: 0,
      errorMessage: null,
      ...emptyCounts(),
    };
  }

  private outcome(
    domain: SyncDomain,
    counts: RecordCounts,
    status: SyncDomainStatus,
    watermark: Date | null,
    startedAt: number,
    error?: unknown,
  ): DomainOutcome {
    return {
      domain,
      status,
      watermark,
      durationMs: Math.round(performance.now() - startedAt),
      errorMessage: error === undefined ? null : messageOf(error),
      ...counts,
    };
  }
}
