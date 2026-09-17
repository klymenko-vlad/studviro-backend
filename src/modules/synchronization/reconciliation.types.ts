import {
  DISCREPANCY_KINDS,
  type DiscrepancyKind,
  type SyncDomain,
} from '../../database/schema';

import type { CanonicalTableName } from './canonical-tables';

/**
 * The canonical table each synchronized domain lands in, split by the source
 * system that owns it. `persons` is absent on purpose: a person becomes a user
 * and a linked identity rather than a provenanced canonical row, so neither side
 * of this map reconciles it — the screen says so rather than staying silent.
 */
export const SIS_RECONCILED_TABLES = {
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

/** The learning half, imported under `sourceSystem: 'lms'` (ADR 0020, ADR 0022). */
export const LMS_RECONCILED_TABLES = {
  learningSpaces: 'learningSpaces',
  learningActivities: 'learningActivities',
  assessments: 'assessments',
  assessmentResults: 'assessmentResults',
  activityCompletions: 'activityCompletions',
  submissions: 'submissionRefs',
} as const satisfies Partial<Record<SyncDomain, CanonicalTableName>>;

export const RECONCILED_TABLES = {
  ...SIS_RECONCILED_TABLES,
  ...LMS_RECONCILED_TABLES,
} as const satisfies Partial<Record<SyncDomain, CanonicalTableName>>;

/**
 * Which half a domain belongs to. A discrepancy names a domain, and the domain
 * alone decides which source system owns the row — so resolution never needs to
 * be told, and can never be told wrongly.
 */
export const RECONCILIATION_SOURCE_SYSTEMS = ['sis', 'lms'] as const;
export type ReconciliationSourceSystem = (typeof RECONCILIATION_SOURCE_SYSTEMS)[number];

export const RECONCILED_TABLES_BY_SOURCE = {
  sis: SIS_RECONCILED_TABLES,
  lms: LMS_RECONCILED_TABLES,
} as const;

export type ReconciledDomain = keyof typeof RECONCILED_TABLES;
export type SisReconciledDomain = keyof typeof SIS_RECONCILED_TABLES;
export type LmsReconciledDomain = keyof typeof LMS_RECONCILED_TABLES;

export function tableFor(domain: ReconciledDomain): CanonicalTableName {
  return RECONCILED_TABLES[domain];
}

export function isReconciled(domain: SyncDomain): domain is ReconciledDomain {
  return domain in RECONCILED_TABLES;
}

export function isReconciledIn(
  domain: SyncDomain,
  sourceSystem: ReconciliationSourceSystem,
): boolean {
  return domain in RECONCILED_TABLES_BY_SOURCE[sourceSystem];
}

/** The source system that owns a reconciled domain's rows. */
export function sourceSystemFor(domain: ReconciledDomain): ReconciliationSourceSystem {
  return domain in LMS_RECONCILED_TABLES ? 'lms' : 'sis';
}

export { DISCREPANCY_KINDS };
export type { DiscrepancyKind };

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
  readonly sourceSystem: ReconciliationSourceSystem;
  readonly connectorName: string;
  readonly checkedAt: Date;
  readonly discrepancyCount: number;
  readonly domains: readonly DomainReconciliation[];
}
