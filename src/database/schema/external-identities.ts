import { isNull } from 'drizzle-orm';
import { index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { deletedAt, timestampColumn, timestamps } from './_shared';
import { institutionId } from './institutions';
import { users } from './users';

/**
 * Which identity provider issued the subject. Open-ended text rather than an
 * enum: the set of providers an institution uses is theirs, not ours. This is
 * not provenance on a canonical row — StudViro is the system of record
 * (ADR 0024) — it exists so a person can sign in through an external IdP.
 */

export const externalIdentities = pgTable(
  'external_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull().default('oidc'),
    issuer: text('issuer').notNull(),
    subject: text('subject').notNull(),
    externalUsername: text('external_username'),
    assertedEmail: text('asserted_email'),
    lastAuthenticatedAt: timestampColumn('last_authenticated_at'),
    lastSynchronizedAt: timestampColumn('last_synchronized_at'),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    uniqueIndex('external_identities_subject_unique_idx')
      .on(table.institutionId, table.issuer, table.subject)
      .where(isNull(table.deletedAt)),
    index('external_identities_user_id_idx').on(table.userId).where(isNull(table.deletedAt)),
  ],
);

export type ExternalIdentity = typeof externalIdentities.$inferSelect;
export type NewExternalIdentity = typeof externalIdentities.$inferInsert;
