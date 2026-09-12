import { isNull } from 'drizzle-orm';
import { pgEnum, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { deletedAt, timestamps } from './_shared';
import { institutionId } from './institutions';

export const CONNECTOR_KINDS = ['academic', 'learning'] as const;
export type ConnectorKind = (typeof CONNECTOR_KINDS)[number];
export const connectorKindEnum = pgEnum('connector_kind', CONNECTOR_KINDS);

export const connectorCredentials = pgTable(
  'connector_credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    connectorKind: connectorKindEnum('connector_kind').notNull(),
    connectorName: text('connector_name').notNull(),
    fieldKey: text('field_key').notNull(),
    cipherText: text('cipher_text').notNull(),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    uniqueIndex('connector_credentials_field_unique_idx')
      .on(table.institutionId, table.connectorKind, table.connectorName, table.fieldKey)
      .where(isNull(table.deletedAt)),
  ],
);

export type ConnectorCredential = typeof connectorCredentials.$inferSelect;
export type NewConnectorCredential = typeof connectorCredentials.$inferInsert;
