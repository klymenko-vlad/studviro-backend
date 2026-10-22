import { isNull } from 'drizzle-orm';
import { index, integer, pgEnum, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { deletedAt, timestampColumn, timestamps } from './_shared';
import { courseOfferings, programs } from './academic-structure';
import { institutionId } from './institutions';
import { users } from './users';

export const PROGRAM_MEMBERSHIP_STATUSES = [
  'active',
  'interrupted',
  'graduated',
  'terminated',
] as const;
export type ProgramMembershipStatus = (typeof PROGRAM_MEMBERSHIP_STATUSES)[number];
export const programMembershipStatus = pgEnum(
  'program_membership_status',
  PROGRAM_MEMBERSHIP_STATUSES,
);

export const programMemberships = pgTable(
  'program_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: programMembershipStatus('status').notNull().default('active'),
    studyYear: integer('study_year'),
    startedAt: timestampColumn('started_at'),
    endedAt: timestampColumn('ended_at'),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    uniqueIndex('program_memberships_unique_idx')
      .on(table.programId, table.userId)
      .where(isNull(table.deletedAt)),
    index('program_memberships_user_id_idx').on(table.userId).where(isNull(table.deletedAt)),
  ],
);

export const ENROLLMENT_STATUSES = [
  'requested',
  'provisioning',
  'active',
  'completed',
  'withdrawn',
  'rejected',
  'waitlisted',
] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];
export const enrollmentStatus = pgEnum('enrollment_status', ENROLLMENT_STATUSES);

/**
 * Statuses that place a student *in* the course right now: they occupy a seat, appear on the
 * roster, count towards the teacher's enrolment total, see the course in their calendar and may
 * register for its exam terms.
 */
export const ENROLLMENT_PARTICIPATING_STATUSES: readonly EnrollmentStatus[] = [
  'provisioning',
  'active',
];

/**
 * Statuses that mean the student holds an academic record for the course — participation plus
 * `completed`. A finished course still owes its student their grades and their transcript entry,
 * so reads over results and course history use this wider set, never
 * {@link ENROLLMENT_PARTICIPATING_STATUSES}.
 */
export const ENROLLMENT_RECORDED_STATUSES: readonly EnrollmentStatus[] = [
  ...ENROLLMENT_PARTICIPATING_STATUSES,
  'completed',
];

/**
 * Statuses that hold a place against the offering's capacity. A request that
 * has not been answered yet holds one, or two students could be given the last
 * seat while neither is `active`.
 */
export const ENROLLMENT_OCCUPYING_STATUSES: readonly EnrollmentStatus[] = [
  'requested',
  ...ENROLLMENT_RECORDED_STATUSES,
];

/** Statuses a student may withdraw from themselves. */
export const ENROLLMENT_WITHDRAWABLE_STATUSES: readonly EnrollmentStatus[] = [
  'waitlisted',
  'requested',
  'provisioning',
  'active',
];

export const ENROLLMENT_REQUIREMENT_TYPES = ['compulsory', 'optional', 'elective'] as const;
export type EnrollmentRequirementType = (typeof ENROLLMENT_REQUIREMENT_TYPES)[number];
export const enrollmentRequirementType = pgEnum(
  'enrollment_requirement_type',
  ENROLLMENT_REQUIREMENT_TYPES,
);

export const enrollments = pgTable(
  'enrollments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    courseOfferingId: uuid('course_offering_id')
      .notNull()
      .references(() => courseOfferings.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    programId: uuid('program_id').references(() => programs.id, { onDelete: 'set null' }),
    status: enrollmentStatus('status').notNull().default('requested'),
    requirementType: enrollmentRequirementType('requirement_type')
      .notNull()
      .default('compulsory'),
    attempt: integer('attempt').notNull().default(1),
    enrolledAt: timestampColumn('enrolled_at'),
    withdrawnAt: timestampColumn('withdrawn_at'),
    waitlistedAt: timestampColumn('waitlisted_at'),
    lmsProvisionedAt: timestampColumn('lms_provisioned_at'),
    lmsProvisioningError: text('lms_provisioning_error'),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    uniqueIndex('enrollments_unique_idx')
      .on(table.courseOfferingId, table.userId)
      .where(isNull(table.deletedAt)),
    index('enrollments_user_id_idx').on(table.userId).where(isNull(table.deletedAt)),
    index('enrollments_offering_status_idx')
      .on(table.courseOfferingId, table.status)
      .where(isNull(table.deletedAt)),
  ],
);

export const STUDY_GROUP_KINDS = ['seminar', 'lab', 'exercise', 'project', 'other'] as const;
export type StudyGroupKind = (typeof STUDY_GROUP_KINDS)[number];
export const studyGroupKind = pgEnum('study_group_kind', STUDY_GROUP_KINDS);

export const studyGroups = pgTable(
  'study_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    courseOfferingId: uuid('course_offering_id')
      .notNull()
      .references(() => courseOfferings.id, { onDelete: 'cascade' }),
    kind: studyGroupKind('kind').notNull().default('seminar'),
    code: text('code').notNull(),
    name: text('name'),
    capacity: integer('capacity'),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    uniqueIndex('study_groups_code_unique_idx')
      .on(table.courseOfferingId, table.code)
      .where(isNull(table.deletedAt)),
  ],
);

export const studyGroupMemberships = pgTable(
  'study_group_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    studyGroupId: uuid('study_group_id')
      .notNull()
      .references(() => studyGroups.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    uniqueIndex('study_group_memberships_unique_idx')
      .on(table.studyGroupId, table.userId)
      .where(isNull(table.deletedAt)),
    index('study_group_memberships_user_id_idx')
      .on(table.userId)
      .where(isNull(table.deletedAt)),
  ],
);

export type ProgramMembership = typeof programMemberships.$inferSelect;
export type NewProgramMembership = typeof programMemberships.$inferInsert;
export type Enrollment = typeof enrollments.$inferSelect;
export type NewEnrollment = typeof enrollments.$inferInsert;
export type StudyGroup = typeof studyGroups.$inferSelect;
export type NewStudyGroup = typeof studyGroups.$inferInsert;
export type StudyGroupMembership = typeof studyGroupMemberships.$inferSelect;
export type NewStudyGroupMembership = typeof studyGroupMemberships.$inferInsert;
