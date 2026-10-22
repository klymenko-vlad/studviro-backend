import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { deletedAt, timestamps } from './_shared';

export const USER_ROLES = ['user', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['invited', 'active', 'suspended'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/**
 * Kept as plain `text` rather than a pg enum: adding a language is a content
 * decision that ships with the frontend's message catalogues, and an enum would
 * make it a migration. Validation happens at the DTO boundary instead.
 *
 * Must stay in step with `LOCALES` in the frontend's `shared/config/i18n`.
 */
export const SUPPORTED_LOCALES = ['en', 'sk'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const userRole = pgEnum('user_role', USER_ROLES);
export const userStatus = pgEnum('user_status', USER_STATUSES);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    passwordHash: text('password_hash'),
    locale: text('locale').notNull().default('en'),
    role: userRole('role').notNull().default('user'),
    status: userStatus('status').notNull().default('active'),
    /**
     * Every access token carries the value it was minted under. Bumping it
     * invalidates all outstanding access tokens at once — the only way to make
     * "sign out everywhere" and a password change take effect before the
     * short access TTL would have expired them anyway.
     */
    tokenVersion: integer('token_version').notNull().default(0),
    /**
     * Set when this row was the shadow side of a merge: a human proved control
     * of the mailbox an imported record was invited under while already
     * holding a self-registered account, and this row lost. Reads resolve it
     * forward at the repository edge rather than 404 on an id that used to be
     * valid.
     */
    mergedIntoUserId: uuid('merged_into_user_id').references((): AnyPgColumn => users.id, {
      onDelete: 'set null',
    }),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    // Deliberately not unique across `invited` rows: two institutions may import
    // the same human, under an address one of them may already hold an account for.
    uniqueIndex('users_email_unique_idx')
      .on(table.email)
      .where(sql`${table.deletedAt} is null and ${table.status} <> 'invited'`),
    index('users_created_at_idx').on(table.createdAt),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
