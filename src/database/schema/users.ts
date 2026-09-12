import { isNull } from 'drizzle-orm';
import { index, integer, pgEnum, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { deletedAt, timestamps } from './_shared';

export const USER_ROLES = ['user', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

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

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    passwordHash: text('password_hash').notNull(),
    locale: text('locale').notNull().default('en'),
    role: userRole('role').notNull().default('user'),
    /**
     * Every access token carries the value it was minted under. Bumping it
     * invalidates all outstanding access tokens at once — the only way to make
     * "sign out everywhere" and a password change take effect before the
     * short access TTL would have expired them anyway.
     */
    tokenVersion: integer('token_version').notNull().default(0),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    // Partial, so a soft-deleted row does not squat on its email forever.
    // Repository reads are scoped to `deleted_at IS NULL` too, which keeps the
    // application-level uniqueness check and this constraint in agreement.
    uniqueIndex('users_email_unique_idx').on(table.email).where(isNull(table.deletedAt)),
    index('users_created_at_idx').on(table.createdAt),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
