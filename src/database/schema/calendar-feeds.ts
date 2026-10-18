import { isNull } from 'drizzle-orm';
import { index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { deletedAt, timestamps } from './_shared';
import { institutions } from './institutions';
import { users } from './users';

/**
 * A person's calendar subscription in one institution: the secret in the feed
 * URL a calendar app polls without signing in (ADR 0038). Stored as the
 * SHA-256 of the token, like `refresh_tokens`, so a leaked table names no feed.
 */
export const calendarFeeds = pgTable(
  'calendar_feeds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    uniqueIndex('calendar_feeds_token_hash_unique_idx')
      .on(table.tokenHash)
      .where(isNull(table.deletedAt)),
    uniqueIndex('calendar_feeds_owner_unique_idx')
      .on(table.institutionId, table.userId)
      .where(isNull(table.deletedAt)),
    index('calendar_feeds_user_id_idx').on(table.userId),
  ],
);

export type CalendarFeed = typeof calendarFeeds.$inferSelect;
export type NewCalendarFeed = typeof calendarFeeds.$inferInsert;
