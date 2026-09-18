import { isNull } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { deletedAt, timestampColumn, timestamps } from './_shared';
import { institutionId, orgUnits } from './institutions';
import { users } from './users';

export const ACADEMIC_TERM_KINDS = [
  'semester',
  'trimester',
  'summer',
  'year',
  'other',
] as const;
export type AcademicTermKind = (typeof ACADEMIC_TERM_KINDS)[number];
export const academicTermKind = pgEnum('academic_term_kind', ACADEMIC_TERM_KINDS);

export const academicTerms = pgTable(
  'academic_terms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    kind: academicTermKind('kind').notNull().default('semester'),
    academicYear: text('academic_year').notNull(),
    startsAt: timestampColumn('starts_at').notNull(),
    endsAt: timestampColumn('ends_at').notNull(),
    enrollmentOpensAt: timestampColumn('enrollment_opens_at'),
    enrollmentClosesAt: timestampColumn('enrollment_closes_at'),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    uniqueIndex('academic_terms_code_unique_idx')
      .on(table.institutionId, table.code)
      .where(isNull(table.deletedAt)),
    index('academic_terms_starts_at_idx').on(table.institutionId, table.startsAt),
  ],
);

export const DEGREE_LEVELS = ['bachelor', 'master', 'doctoral', 'other'] as const;
export type DegreeLevel = (typeof DEGREE_LEVELS)[number];
export const degreeLevel = pgEnum('degree_level', DEGREE_LEVELS);

export const STUDY_FORMS = ['full_time', 'part_time', 'distance'] as const;
export type StudyForm = (typeof STUDY_FORMS)[number];
export const studyForm = pgEnum('study_form', STUDY_FORMS);

export const programs = pgTable(
  'programs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    orgUnitId: uuid('org_unit_id').references(() => orgUnits.id, { onDelete: 'set null' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    degreeLevel: degreeLevel('degree_level').notNull().default('bachelor'),
    studyForm: studyForm('study_form').notNull().default('full_time'),
    standardLengthSemesters: integer('standard_length_semesters'),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    uniqueIndex('programs_code_unique_idx')
      .on(table.institutionId, table.code)
      .where(isNull(table.deletedAt)),
    index('programs_org_unit_id_idx').on(table.orgUnitId),
  ],
);

export const courses = pgTable(
  'courses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    orgUnitId: uuid('org_unit_id').references(() => orgUnits.id, { onDelete: 'set null' }),
    code: text('code').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    credits: numeric('credits', { precision: 6, scale: 2 }),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    uniqueIndex('courses_code_unique_idx')
      .on(table.institutionId, table.code)
      .where(isNull(table.deletedAt)),
    index('courses_org_unit_id_idx').on(table.orgUnitId),
  ],
);

export const COURSE_OFFERING_STATUSES = [
  'planned',
  'open',
  'running',
  'closed',
  'cancelled',
] as const;
export type CourseOfferingStatus = (typeof COURSE_OFFERING_STATUSES)[number];
export const courseOfferingStatus = pgEnum('course_offering_status', COURSE_OFFERING_STATUSES);

export const courseOfferings = pgTable(
  'course_offerings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    academicTermId: uuid('academic_term_id')
      .notNull()
      .references(() => academicTerms.id, { onDelete: 'cascade' }),
    orgUnitId: uuid('org_unit_id').references(() => orgUnits.id, { onDelete: 'set null' }),
    status: courseOfferingStatus('status').notNull().default('planned'),
    language: text('language'),
    capacity: integer('capacity'),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    uniqueIndex('course_offerings_course_term_unique_idx')
      .on(table.courseId, table.academicTermId)
      .where(isNull(table.deletedAt)),
    index('course_offerings_term_idx')
      .on(table.institutionId, table.academicTermId)
      .where(isNull(table.deletedAt)),
  ],
);

export const TEACHING_ROLES = [
  'lecturer',
  'seminar_leader',
  'lab_supervisor',
  'examiner',
  'assistant',
] as const;
export type TeachingRole = (typeof TEACHING_ROLES)[number];
export const teachingRole = pgEnum('teaching_role', TEACHING_ROLES);

export const teachingAssignments = pgTable(
  'teaching_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    courseOfferingId: uuid('course_offering_id')
      .notNull()
      .references(() => courseOfferings.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: teachingRole('role').notNull().default('lecturer'),
    isPrimary: boolean('is_primary').notNull().default(false),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    uniqueIndex('teaching_assignments_unique_idx')
      .on(table.courseOfferingId, table.userId, table.role)
      .where(isNull(table.deletedAt)),
    index('teaching_assignments_user_id_idx').on(table.userId).where(isNull(table.deletedAt)),
  ],
);

export type AcademicTerm = typeof academicTerms.$inferSelect;
export type NewAcademicTerm = typeof academicTerms.$inferInsert;
export type Program = typeof programs.$inferSelect;
export type NewProgram = typeof programs.$inferInsert;
export type Course = typeof courses.$inferSelect;
export type NewCourse = typeof courses.$inferInsert;
export type CourseOffering = typeof courseOfferings.$inferSelect;
export type NewCourseOffering = typeof courseOfferings.$inferInsert;
export type TeachingAssignment = typeof teachingAssignments.$inferSelect;
export type NewTeachingAssignment = typeof teachingAssignments.$inferInsert;
