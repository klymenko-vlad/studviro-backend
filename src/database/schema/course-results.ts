import { isNull } from 'drizzle-orm';
import { index, numeric, pgEnum, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import {
  deletedAt,
  externalIdUnique,
  provenance,
  timestampColumn,
  timestamps,
} from './_shared';
import { enrollments } from './enrollments';
import { institutionId } from './institutions';
import { users } from './users';

export const COURSE_GRADES = ['A', 'B', 'C', 'D', 'E', 'FX', 'passed', 'failed'] as const;
export type CourseGrade = (typeof COURSE_GRADES)[number];
export const courseGrade = pgEnum('course_grade', COURSE_GRADES);

export const OFFICIAL_COURSE_RESULT_STATUSES = [
  'calculated',
  'proposed',
  'official',
  'corrected',
  'annulled',
  'disputed',
] as const;
export type OfficialCourseResultStatus = (typeof OFFICIAL_COURSE_RESULT_STATUSES)[number];
export const officialCourseResultStatus = pgEnum(
  'official_course_result_status',
  OFFICIAL_COURSE_RESULT_STATUSES,
);

export const officialCourseResults = pgTable(
  'official_course_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    enrollmentId: uuid('enrollment_id')
      .notNull()
      .references(() => enrollments.id, { onDelete: 'cascade' }),
    status: officialCourseResultStatus('status').notNull().default('calculated'),
    calculatedPoints: numeric('calculated_points', { precision: 10, scale: 4 }),
    calculatedGrade: courseGrade('calculated_grade'),
    proposedGrade: courseGrade('proposed_grade'),
    proposedById: uuid('proposed_by_id').references(() => users.id, { onDelete: 'set null' }),
    proposedAt: timestampColumn('proposed_at'),
    officialGrade: courseGrade('official_grade'),
    officialRecordedById: uuid('official_recorded_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    officialRecordedAt: timestampColumn('official_recorded_at'),
    conflictNote: text('conflict_note'),
    deletedAt,
    ...provenance,
    ...timestamps,
  },
  (table) => [
    uniqueIndex('official_course_results_enrollment_unique_idx')
      .on(table.enrollmentId)
      .where(isNull(table.deletedAt)),
    externalIdUnique('official_course_results_external_id_unique_idx', table),
    index('official_course_results_status_idx')
      .on(table.institutionId, table.status)
      .where(isNull(table.deletedAt)),
  ],
);

export type OfficialCourseResult = typeof officialCourseResults.$inferSelect;
export type NewOfficialCourseResult = typeof officialCourseResults.$inferInsert;
