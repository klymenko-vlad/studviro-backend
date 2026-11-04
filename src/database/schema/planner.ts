import { isNull, sql } from 'drizzle-orm';
import { check, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { deletedAt, timestampColumn, timestamps } from './_shared';
import { institutions } from './institutions';
import { users } from './users';

export const personalTasks = pgTable(
  'personal_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    note: text('note'),
    dueAt: timestampColumn('due_at'),
    completedAt: timestampColumn('completed_at'),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    index('personal_tasks_owner_due_idx')
      .on(table.institutionId, table.userId, table.dueAt, table.id)
      .where(isNull(table.deletedAt)),
    index('personal_tasks_user_id_idx').on(table.userId),
  ],
);

export const personalEvents = pgTable(
  'personal_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    note: text('note'),
    location: text('location'),
    startsAt: timestampColumn('starts_at').notNull(),
    endsAt: timestampColumn('ends_at').notNull(),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    check('personal_events_ends_after_start', sql`${table.endsAt} > ${table.startsAt}`),
    index('personal_events_owner_starts_idx')
      .on(table.institutionId, table.userId, table.startsAt)
      .where(isNull(table.deletedAt)),
    index('personal_events_user_id_idx').on(table.userId),
  ],
);

export type PersonalTask = typeof personalTasks.$inferSelect;
export type NewPersonalTask = typeof personalTasks.$inferInsert;
export type PersonalEvent = typeof personalEvents.$inferSelect;
export type NewPersonalEvent = typeof personalEvents.$inferInsert;
