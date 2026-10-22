import { isNull } from 'drizzle-orm';
import { index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { deletedAt, timestampColumn, timestamps } from './_shared';
import { users } from './users';

/**
 * Self-service reset for an already-active account. Separate from
 * `invitations`: a reset proves nothing about institutional membership, so it
 * carries no grant and no institution. `token_hash` follows the same
 * SHA-256-of-a-random-token pattern as `refresh_tokens` and `invitations`.
 */
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestampColumn('expires_at').notNull(),
    consumedAt: timestampColumn('consumed_at'),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    uniqueIndex('password_reset_tokens_token_hash_unique_idx')
      .on(table.tokenHash)
      .where(isNull(table.deletedAt)),
    index('password_reset_tokens_user_id_idx').on(table.userId).where(isNull(table.deletedAt)),
  ],
);

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;
