import { isNull, sql } from 'drizzle-orm';
import { check, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { deletedAt, timestampColumn, timestamps } from './_shared';
import { institutionId } from './institutions';
import { canonicalRole, roleScopeType } from './role-assignments';
import { users } from './users';

/**
 * A deferred role assignment (ADR 0016, ADR 0018): accepting one creates an
 * ordinary `role_assignments` row. `address` rather than `userId` because the
 * invited human may not have an account yet — claiming one is the point.
 *
 * A platform-issued claim on an address, not a synced academic record — so
 * unlike the tables in `academic-structure.ts` it carries no provenance
 * columns, the same choice already made for `refresh_tokens`.
 *
 * The token itself is never stored: `token_hash` is its SHA-256 digest,
 * exactly like `refresh_tokens.token_hash`, so a dump of this table cannot be
 * replayed as the invitation.
 */
export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    address: text('address').notNull(),
    role: canonicalRole('role').notNull(),
    scopeType: roleScopeType('scope_type').notNull(),
    scopeId: uuid('scope_id'),
    invitedById: uuid('invited_by_id').references(() => users.id, { onDelete: 'set null' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestampColumn('expires_at').notNull(),
    acceptedAt: timestampColumn('accepted_at'),
    acceptedUserId: uuid('accepted_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    uniqueIndex('invitations_token_hash_unique_idx')
      .on(table.tokenHash)
      .where(isNull(table.deletedAt)),
    index('invitations_address_idx')
      .on(table.institutionId, table.address)
      .where(isNull(table.deletedAt)),
    check(
      'invitations_scope_id_matches_type',
      sql`(${table.scopeType} = 'institution') = (${table.scopeId} is null)`,
    ),
  ],
);

export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
