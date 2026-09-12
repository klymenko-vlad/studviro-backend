import { isNull, sql } from 'drizzle-orm';
import { boolean, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { deletedAt, timestampColumn, timestamps } from './_shared';
import { institutions } from './institutions';
import { users } from './users';

export const userEmails = pgTable(
  'user_emails',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    address: text('address').notNull(),
    institutionId: uuid('institution_id').references(() => institutions.id, {
      onDelete: 'cascade',
    }),
    verifiedAt: timestampColumn('verified_at'),
    isPrimary: boolean('is_primary').notNull().default(false),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    // Only a proven address is unique. An unverified row is what an institution
    // asserted, and two institutions may assert the same address for one human.
    uniqueIndex('user_emails_verified_address_unique_idx')
      .on(table.address)
      .where(sql`${table.deletedAt} is null and ${table.verifiedAt} is not null`),
    uniqueIndex('user_emails_user_address_unique_idx')
      .on(table.userId, table.address)
      .where(isNull(table.deletedAt)),
    index('user_emails_user_id_idx').on(table.userId).where(isNull(table.deletedAt)),
  ],
);

export type UserEmail = typeof userEmails.$inferSelect;
export type NewUserEmail = typeof userEmails.$inferInsert;
