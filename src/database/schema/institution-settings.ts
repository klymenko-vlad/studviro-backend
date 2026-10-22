import { isNull } from 'drizzle-orm';
import { jsonb, pgTable, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { deletedAt, timestamps } from './_shared';
import { institutionId } from './institutions';

export const TERMINOLOGY_KEYS = [
  'institution',
  'faculty',
  'department',
  'program',
  'course',
  'courseOffering',
  'academicTerm',
  'student',
  'teacher',
  'studentIdentifier',
  'credits',
] as const;
export type TerminologyKey = (typeof TERMINOLOGY_KEYS)[number];
export type TerminologyOverrides = Partial<Record<TerminologyKey, string>>;

export const FEATURE_FLAGS = [
  'courseRegistration',
  'examRegistration',
  'timetable',
  'grades',
  'thesis',
  'accommodation',
  'fees',
] as const;
export type FeatureFlag = (typeof FEATURE_FLAGS)[number];
export type FeatureOverrides = Partial<Record<FeatureFlag, boolean>>;

export const institutionSettings = pgTable(
  'institution_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    terminology: jsonb('terminology').$type<TerminologyOverrides>().notNull().default({}),
    features: jsonb('features').$type<FeatureOverrides>().notNull().default({}),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    uniqueIndex('institution_settings_institution_unique_idx')
      .on(table.institutionId)
      .where(isNull(table.deletedAt)),
  ],
);

export type InstitutionSettings = typeof institutionSettings.$inferSelect;
export type NewInstitutionSettings = typeof institutionSettings.$inferInsert;
