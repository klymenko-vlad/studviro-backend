import type { SourceSystem, SyncDomain, SyncDomainStatus } from '../../database/schema';

export interface SyncTarget {
  readonly institutionId: string;
  readonly sourceSystem: SourceSystem;
  readonly connectorName: string;
}

export type ApplyOutcome = 'created' | 'updated' | 'deleted' | 'skipped';

export interface AppliedChange<TRow> {
  readonly outcome: ApplyOutcome;
  readonly previous: TRow | null;
  readonly current: TRow | null;
}

export interface RecordCounts {
  fetched: number;
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
  failed: number;
}

export interface DomainOutcome extends RecordCounts {
  readonly domain: SyncDomain;
  readonly status: SyncDomainStatus;
  readonly watermark: Date | null;
  readonly durationMs: number;
  readonly errorMessage: string | null;
}

export function emptyCounts(): RecordCounts {
  return { fetched: 0, created: 0, updated: 0, deleted: 0, skipped: 0, failed: 0 };
}

export function addCounts(total: RecordCounts, counts: RecordCounts): RecordCounts {
  return {
    fetched: total.fetched + counts.fetched,
    created: total.created + counts.created,
    updated: total.updated + counts.updated,
    deleted: total.deleted + counts.deleted,
    skipped: total.skipped + counts.skipped,
    failed: total.failed + counts.failed,
  };
}
