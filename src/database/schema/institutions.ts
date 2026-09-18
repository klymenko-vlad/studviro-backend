import { isNull } from 'drizzle-orm';
import {
  type AnyPgColumn,
  index,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { deletedAt, timestamps } from './_shared';

export const institutions = pgTable(
  'institutions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    defaultLocale: text('default_locale').notNull().default('en'),
    timezone: text('timezone').notNull().default('Europe/Bratislava'),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    uniqueIndex('institutions_code_unique_idx').on(table.code).where(isNull(table.deletedAt)),
  ],
);

export const institutionId = () =>
  uuid('institution_id')
    .notNull()
    .references((): AnyPgColumn => institutions.id, { onDelete: 'cascade' });

export const ORG_UNIT_TYPES = [
  'university',
  'faculty',
  'department',
  'institute',
  'other',
] as const;
export type OrgUnitType = (typeof ORG_UNIT_TYPES)[number];
export const orgUnitType = pgEnum('org_unit_type', ORG_UNIT_TYPES);

export const orgUnits = pgTable(
  'org_units',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    parentId: uuid('parent_id').references((): AnyPgColumn => orgUnits.id, {
      onDelete: 'set null',
    }),
    type: orgUnitType('type').notNull().default('faculty'),
    code: text('code').notNull(),
    name: text('name').notNull(),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    uniqueIndex('org_units_code_unique_idx')
      .on(table.institutionId, table.code)
      .where(isNull(table.deletedAt)),
    index('org_units_parent_id_idx').on(table.parentId),
  ],
);

export type Institution = typeof institutions.$inferSelect;
export type NewInstitution = typeof institutions.$inferInsert;
export type OrgUnit = typeof orgUnits.$inferSelect;
export type NewOrgUnit = typeof orgUnits.$inferInsert;
