import { isNull } from 'drizzle-orm';
import { index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { deletedAt, sourceSystemEnum, timestampColumn, timestamps } from './_shared';
import { institutionId } from './institutions';
import { users } from './users';

export const externalIdentities = pgTable(
  'external_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourceSystem: sourceSystemEnum('source_system').notNull(),
    issuer: text('issuer').notNull(),
    subject: text('subject').notNull(),
    externalUsername: text('external_username'),
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
