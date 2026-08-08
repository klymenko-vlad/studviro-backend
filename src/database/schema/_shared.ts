import { sql } from 'drizzle-orm';
import { type PgColumn, pgEnum, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * Millisecond precision, deliberately.
 *
 * Postgres stores `timestamptz` to the microsecond, but a JavaScript `Date`
 * only carries milliseconds — so a value read out of the database and sent back
 * in (a keyset pagination cursor, an idempotency check, an optimistic-locking
 * comparison) silently rounds down and no longer matches the row it came from.
 * Storing what the application can actually represent removes the whole class
 * of bug.
 *
 * Any column used as a keyset sort key should be declared the same way.
 */
const TIMESTAMP_PRECISION = 3;

export const timestampColumn = (name: string) =>
  timestamp(name, { withTimezone: true, precision: TIMESTAMP_PRECISION, mode: 'date' });

export const timestamps = {
  createdAt: timestampColumn('created_at').notNull().defaultNow(),
  updatedAt: timestampColumn('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** Soft-delete marker. Null means the row is live. */
export const deletedAt = timestampColumn('deleted_at');

export const SOURCE_SYSTEMS = ['platform', 'sis', 'lms'] as const;
export type SourceSystem = (typeof SOURCE_SYSTEMS)[number];
export const sourceSystemEnum = pgEnum('source_system', SOURCE_SYSTEMS);

export const SYNCHRONIZATION_STATUSES = ['in_sync', 'pending', 'conflict', 'failed'] as const;
export type SynchronizationStatus = (typeof SYNCHRONIZATION_STATUSES)[number];
export const synchronizationStatusEnum = pgEnum(
  'synchronization_status',
  SYNCHRONIZATION_STATUSES,
);

export const provenance = {
  sourceSystem: sourceSystemEnum('source_system').notNull().default('platform'),
  externalId: text('external_id'),
  sourceVersion: text('source_version'),
  sourceUpdatedAt: timestampColumn('source_updated_at'),
  lastSynchronizedAt: timestampColumn('last_synchronized_at'),
  synchronizationStatus: synchronizationStatusEnum('synchronization_status')
    .notNull()
    .default('in_sync'),
};

interface ProvenancedColumns {
  institutionId: PgColumn;
  sourceSystem: PgColumn;
  externalId: PgColumn;
  deletedAt: PgColumn;
}

export const externalIdUnique = (indexName: string, table: ProvenancedColumns) =>
  uniqueIndex(indexName)
    .on(table.institutionId, table.sourceSystem, table.externalId)
    .where(sql`${table.externalId} is not null and ${table.deletedAt} is null`);
