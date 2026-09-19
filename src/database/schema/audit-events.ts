import { index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { timestampColumn, timestamps } from './_shared';
import { institutionId } from './institutions';
import { users } from './users';

/**
 * Append-only: there is no `deleted_at` and nothing updates a row, so the
 * table is deliberately outside `BaseRepository`, whose whole contract is
 * mutation.
 */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    subjectType: text('subject_type').notNull(),
    subjectId: uuid('subject_id').notNull(),
    summary: text('summary'),
    before: jsonb('before').$type<Record<string, unknown>>(),
    after: jsonb('after').$type<Record<string, unknown>>(),
    requestId: text('request_id'),
    occurredAt: timestampColumn('occurred_at').notNull().defaultNow(),
    ...timestamps,
  },
  (table) => [
    index('audit_events_institution_occurred_at_idx').on(
      table.institutionId,
      table.occurredAt,
      table.id,
    ),
    index('audit_events_subject_idx').on(
      table.institutionId,
      table.subjectType,
      table.subjectId,
      table.occurredAt,
    ),
    index('audit_events_actor_idx').on(
      table.institutionId,
      table.actorUserId,
      table.occurredAt,
    ),
  ],
);

export type AuditEvent = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;
