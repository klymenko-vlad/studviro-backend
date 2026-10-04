import { isNull } from 'drizzle-orm';
import { index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { deletedAt, timestampColumn, timestamps } from './_shared';
import { users } from './users';

export const twoFactorCredentials = pgTable(
  'two_factor_credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    secretCiphertext: text('secret_ciphertext').notNull(),
    enabledAt: timestampColumn('enabled_at'),
    /** The last 30-second step a code was accepted for, so an observed code cannot be replayed. */
    lastUsedStep: integer('last_used_step'),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    uniqueIndex('two_factor_credentials_user_id_unique_idx')
      .on(table.userId)
      .where(isNull(table.deletedAt)),
  ],
);

export const twoFactorRecoveryCodes = pgTable(
  'two_factor_recovery_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    usedAt: timestampColumn('used_at'),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    index('two_factor_recovery_codes_user_id_idx')
      .on(table.userId)
      .where(isNull(table.deletedAt)),
  ],
);

export type TwoFactorCredential = typeof twoFactorCredentials.$inferSelect;
export type TwoFactorRecoveryCode = typeof twoFactorRecoveryCodes.$inferSelect;
