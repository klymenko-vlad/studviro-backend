import { isNull, sql } from 'drizzle-orm';
import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { deletedAt, timestampColumn, timestamps } from './_shared';
import { users } from './users';

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * SHA-256 of the token, never the token itself. A dump of this table must
     * not be enough to impersonate anyone — the same reason `password_hash`
     * exists rather than a password column.
     */
    tokenHash: text('token_hash').notNull().unique(),
    /**
     * Rotation lineage. When a refresh token is redeemed it is marked replaced
     * by its successor; a second redemption of an already-replaced token means
     * the token leaked, and the whole family is revoked.
     */
    replacedByTokenHash: text('replaced_by_token_hash'),
    sessionId: uuid('session_id').notNull().defaultRandom(),
    sessionStartedAt: timestampColumn('session_started_at').notNull().defaultNow(),
    revokedAt: timestampColumn('revoked_at'),
    expiresAt: timestampColumn('expires_at').notNull(),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    index('refresh_tokens_user_id_idx').on(table.userId).where(isNull(table.deletedAt)),
    index('refresh_tokens_session_id_idx').on(table.sessionId).where(isNull(table.revokedAt)),
    // Drives the expiry sweep; partial so it stays small as tokens are cleaned.
    index('refresh_tokens_expires_at_idx')
      .on(table.expiresAt)
      .where(sql`${table.revokedAt} is null`),
  ],
);

export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;
