import type { SyncDomain } from '../../database/schema';

import type { CanonicalTableName } from './canonical-tables';

/**
 * The canonical table each synchronized domain lands in. `persons` is absent on
 * purpose: a person becomes a user and a linked identity rather than a
 * provenanced canonical row, so it is reconciled by neither side of this map.
 */
export const RECONCILED_TABLES = {
  orgUnits: 'orgUnits',
  academicTerms: 'academicTerms',
  rooms: 'rooms',
  programs: 'programs',
  courses: 'courses',
  courseOfferings: 'courseOfferings',
  programMemberships: 'programMemberships',
  studyGroups: 'studyGroups',
  enrollments: 'enrollments',
  timetableEvents: 'timetableEvents',
  examTerms: 'examTerms',
  officialResults: 'officialCourseResults',
} as const satisfies Partial<Record<SyncDomain, CanonicalTableName>>;

export type ReconciledDomain = keyof typeof RECONCILED_TABLES;

export function tableFor(domain: ReconciledDomain): CanonicalTableName {
  return RECONCILED_TABLES[domain];
}

export function isReconciled(domain: SyncDomain): domain is ReconciledDomain {
  return domain in RECONCILED_TABLES;
}

export const DISCREPANCY_KINDS = [
  'missing_in_platform',
  'missing_in_source',
  'stale',
  'conflict',
] as const;
export type DiscrepancyKind = (typeof DISCREPANCY_KINDS)[number];

export const RECONCILIATION_DOMAIN_STATUSES = ['checked', 'skipped', 'failed'] as const;
export type ReconciliationDomainStatus = (typeof RECONCILIATION_DOMAIN_STATUSES)[number];

export interface Discrepancy {
  readonly kind: DiscrepancyKind;
  /** Null when the platform row claims this source but carries no external identifier. */
  readonly externalId: string | null;
  readonly canonicalId: string | null;
  readonly sourceUpdatedAt: Date | null;
  readonly platformUpdatedAt: Date | null;
  readonly detail: string;
}

export interface DomainReconciliation {
  readonly domain: ReconciledDomain;
  readonly status: ReconciliationDomainStatus;
  readonly sourceCount: number;
  readonly platformCount: number;
  readonly matched: number;
  readonly discrepancyCount: number;
  readonly discrepancies: readonly Discrepancy[];
  readonly truncated: boolean;
  readonly errorMessage: string | null;
}

export interface ReconciliationReport {
  readonly institutionId: string;
  readonly connectorName: string;
  readonly checkedAt: Date;
  readonly discrepancyCount: number;
  readonly domains: readonly DomainReconciliation[];
}
