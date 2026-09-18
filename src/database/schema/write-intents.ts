import { isNull, sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { deletedAt, sourceSystemEnum, timestampColumn, timestamps } from './_shared';
import { institutionId } from './institutions';
import { users } from './users';

export const SOURCE_WRITE_INTENT_KINDS = [
  'exam_registration.create',
  'exam_registration.cancel',
  'course_enrollment.request',
  'course_enrollment.withdraw',
  'course_result.publish',
  'learning_space.provision',
  'learning_enrollment.upsert',
] as const;
export type SourceWriteIntentKind = (typeof SOURCE_WRITE_INTENT_KINDS)[number];
export const sourceWriteIntentKind = pgEnum(
  'source_write_intent_kind',
  SOURCE_WRITE_INTENT_KINDS,
);

export const SOURCE_WRITE_INTENT_STATES = [
  'pending',
  'in_flight',
  'acknowledged',
  'rejected',
  'abandoned',
] as const;
export type SourceWriteIntentState = (typeof SOURCE_WRITE_INTENT_STATES)[number];
export const sourceWriteIntentState = pgEnum(
  'source_write_intent_state',
  SOURCE_WRITE_INTENT_STATES,
);

export const LIVE_SOURCE_WRITE_INTENT_STATES = ['pending', 'in_flight'] as const;
export const STUCK_SOURCE_WRITE_INTENT_STATES = ['rejected', 'abandoned'] as const;

export const sourceWriteIntents = pgTable(
  'source_write_intents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    targetSourceSystem: sourceSystemEnum('target_source_system').notNull(),
    connectorName: text('connector_name').notNull(),
    kind: sourceWriteIntentKind('kind').notNull(),
    canonicalTable: text('canonical_table').notNull(),
    // Deliberately no foreign key: this is a platform record of a platform
    // decision about a row that may since have been tombstoned.
    canonicalId: uuid('canonical_id').notNull(),
    payload: jsonb('payload').notNull().$type<Record<string, unknown>>(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    state: sourceWriteIntentState('state').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestampColumn('next_attempt_at'),
    deliveredAt: timestampColumn('delivered_at'),
    acknowledgedExternalId: text('acknowledged_external_id'),
    lastErrorCode: text('last_error_code'),
    lastErrorMessage: text('last_error_message'),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    // One *queued* intent per canonical row. An in-flight intent plus a fresh
    // pending one coexist, which is how a cancel queues behind its own
    // registration instead of overtaking it.
    uniqueIndex('source_write_intents_queued_unique_idx')
      .on(table.institutionId, table.canonicalId)
      .where(sql`${table.state} = 'pending' and ${table.deletedAt} is null`),
    index('source_write_intents_live_idx')
      .on(table.institutionId, table.canonicalId)
      .where(sql`${table.state} in ('pending', 'in_flight') and ${table.deletedAt} is null`),
    index('source_write_intents_institution_created_at_idx')
      .on(table.institutionId, table.createdAt)
      .where(isNull(table.deletedAt)),
  ],
);

export type SourceWriteIntent = typeof sourceWriteIntents.$inferSelect;
export type NewSourceWriteIntent = typeof sourceWriteIntents.$inferInsert;
