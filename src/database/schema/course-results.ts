import { isNull } from 'drizzle-orm';
import {
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

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

/**
 * Which grades are a pass. The only copy of the rule: a credit total, a weighted
 * average and the retake ladder all read it, and nothing else decides.
 */
export const PASSING_COURSE_GRADES = ['A', 'B', 'C', 'D', 'E', 'passed'] as const;
export const FAILING_COURSE_GRADES = ['FX', 'failed'] as const;

export function isPassingGrade(grade: CourseGrade | null | undefined): boolean {
  return (
    grade !== null &&
    grade !== undefined &&
    (PASSING_COURSE_GRADES as readonly string[]).includes(grade)
  );
}

export function isFailingGrade(grade: CourseGrade | null | undefined): boolean {
  return (
    grade !== null &&
    grade !== undefined &&
    (FAILING_COURSE_GRADES as readonly string[]).includes(grade)
  );
}

/**
 * The Slovak 1–4 scale the weighted average is computed on. `passed` and
 * `failed` carry no number, so a pass/fail course counts towards credits and
 * not towards the average.
 */
export const COURSE_GRADE_POINTS: Readonly<Partial<Record<CourseGrade, number>>> = {
  A: 1,
  B: 1.5,
  C: 2,
  D: 2.5,
  E: 3,
  FX: 4,
};

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

/**
 * An annulled result has been struck: its grade is history, not the student's
 * standing. Every other status still lets the grade speak — `disputed` is
 * contested rather than withdrawn, and `corrected` is the correction itself.
 */
export const VOIDED_COURSE_RESULT_STATUSES = ['annulled'] as const;

export function isVoidedResult(status: OfficialCourseResultStatus): boolean {
  return (VOIDED_COURSE_RESULT_STATUSES as readonly string[]).includes(status);
}

export const officialCourseResults = pgTable(
  'official_course_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    enrollmentId: uuid('enrollment_id')
      .notNull()
      .references(() => enrollments.id, { onDelete: 'cascade' }),
    status: officialCourseResultStatus('status').notNull().default('calculated'),
    attempt: integer('attempt').notNull().default(1),
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
    // Keyed on the attempt, so a resit is a second row rather than an overwrite
    // of the failure that made it necessary.
    uniqueIndex('official_course_results_enrollment_attempt_unique_idx')
      .on(table.enrollmentId, table.attempt)
      .where(isNull(table.deletedAt)),
    externalIdUnique('official_course_results_external_id_unique_idx', table),
    index('official_course_results_status_idx')
      .on(table.institutionId, table.status)
      .where(isNull(table.deletedAt)),
  ],
);

export type OfficialCourseResult = typeof officialCourseResults.$inferSelect;
export type NewOfficialCourseResult = typeof officialCourseResults.$inferInsert;
