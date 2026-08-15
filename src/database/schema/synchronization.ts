import { isNull } from 'drizzle-orm';
import { index, integer, pgEnum, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { deletedAt, sourceSystemEnum, timestampColumn, timestamps } from './_shared';
import { institutionId } from './institutions';
import { users } from './users';

export const SYNC_DOMAINS = [
  'orgUnits',
  'persons',
  'academicTerms',
  'rooms',
  'programs',
  'courses',
  'courseOfferings',
  'programMemberships',
  'studyGroups',
  'enrollments',
  'timetableEvents',
  'examTerms',
  'officialResults',
] as const;
export type SyncDomain = (typeof SYNC_DOMAINS)[number];
export const syncDomain = pgEnum('sync_domain', SYNC_DOMAINS);

export const SYNC_RUN_STATUSES = [
  'queued',
  'running',
  'succeeded',
  'partial',
  'failed',
] as const;
export type SyncRunStatus = (typeof SYNC_RUN_STATUSES)[number];
export const syncRunStatus = pgEnum('sync_run_status', SYNC_RUN_STATUSES);

export const SYNC_RUN_TRIGGERS = ['manual', 'scheduled'] as const;
export type SyncRunTrigger = (typeof SYNC_RUN_TRIGGERS)[number];
export const syncRunTrigger = pgEnum('sync_run_trigger', SYNC_RUN_TRIGGERS);

export const SYNC_RUN_MODES = ['incremental', 'full'] as const;
export type SyncRunMode = (typeof SYNC_RUN_MODES)[number];
export const syncRunMode = pgEnum('sync_run_mode', SYNC_RUN_MODES);

export const SYNC_DOMAIN_STATUSES = ['succeeded', 'partial', 'failed', 'skipped'] as const;
export type SyncDomainStatus = (typeof SYNC_DOMAIN_STATUSES)[number];
export const syncDomainStatus = pgEnum('sync_domain_status', SYNC_DOMAIN_STATUSES);

const counters = {
  fetched: integer('fetched').notNull().default(0),
  created: integer('created').notNull().default(0),
  updated: integer('updated').notNull().default(0),
  deleted: integer('deleted').notNull().default(0),
  skipped: integer('skipped').notNull().default(0),
  failed: integer('failed').notNull().default(0),
};

export const syncRuns = pgTable(
  'sync_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    sourceSystem: sourceSystemEnum('source_system').notNull(),
    connectorName: text('connector_name').notNull(),
    trigger: syncRunTrigger('trigger').notNull().default('manual'),
    mode: syncRunMode('mode').notNull().default('incremental'),
    status: syncRunStatus('status').notNull().default('queued'),
    requestedById: uuid('requested_by_id').references(() => users.id, { onDelete: 'set null' }),
    queuedAt: timestampColumn('queued_at').notNull().defaultNow(),
    startedAt: timestampColumn('started_at'),
    finishedAt: timestampColumn('finished_at'),
    ...counters,
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    index('sync_runs_institution_queued_at_idx')
      .on(table.institutionId, table.queuedAt)
      .where(isNull(table.deletedAt)),
    index('sync_runs_status_idx').on(table.status).where(isNull(table.deletedAt)),
  ],
);

export const syncDomainResults = pgTable(
  'sync_domain_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    runId: uuid('run_id')
      .notNull()
      .references(() => syncRuns.id, { onDelete: 'cascade' }),
    domain: syncDomain('domain').notNull(),
    status: syncDomainStatus('status').notNull(),
    ...counters,
    watermark: timestampColumn('watermark'),
    durationMs: integer('duration_ms').notNull().default(0),
    errorMessage: text('error_message'),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    uniqueIndex('sync_domain_results_run_domain_unique_idx')
      .on(table.runId, table.domain)
      .where(isNull(table.deletedAt)),
  ],
);

export const syncWatermarks = pgTable(
  'sync_watermarks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    sourceSystem: sourceSystemEnum('source_system').notNull(),
    domain: syncDomain('domain').notNull(),
    connectorName: text('connector_name').notNull(),
    sourceUpdatedAt: timestampColumn('source_updated_at'),
    lastRunId: uuid('last_run_id').references(() => syncRuns.id, { onDelete: 'set null' }),
    lastStatus: syncDomainStatus('last_status'),
    lastSucceededAt: timestampColumn('last_succeeded_at'),
    lastAttemptedAt: timestampColumn('last_attempted_at'),
    lastErrorMessage: text('last_error_message'),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    uniqueIndex('sync_watermarks_unique_idx')
      .on(table.institutionId, table.sourceSystem, table.domain)
      .where(isNull(table.deletedAt)),
  ],
);

export type SyncRun = typeof syncRuns.$inferSelect;
export type NewSyncRun = typeof syncRuns.$inferInsert;
export type SyncDomainResult = typeof syncDomainResults.$inferSelect;
export type NewSyncDomainResult = typeof syncDomainResults.$inferInsert;
export type SyncWatermark = typeof syncWatermarks.$inferSelect;
export type NewSyncWatermark = typeof syncWatermarks.$inferInsert;
