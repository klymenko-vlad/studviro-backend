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

import {
  deletedAt,
  externalIdUnique,
  provenance,
  timestampColumn,
  timestamps,
} from './_shared';
import { courseOfferings } from './academic-structure';
import { institutionId } from './institutions';
import { users } from './users';

export const learningSpaces = pgTable(
  'learning_spaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    courseOfferingId: uuid('course_offering_id').references(() => courseOfferings.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    shortName: text('short_name'),
    url: text('url'),
    visible: boolean('visible').notNull().default(true),
    deletedAt,
    ...provenance,
    ...timestamps,
  },
  (table) => [
    externalIdUnique('learning_spaces_external_id_unique_idx', table),
    uniqueIndex('learning_spaces_offering_unique_idx')
      .on(table.courseOfferingId, table.sourceSystem)
      .where(isNull(table.deletedAt)),
  ],
);

export const LEARNING_ACTIVITY_TYPES = [
  'assignment',
  'quiz',
  'forum',
  'resource',
  'workshop',
  'other',
] as const;
export type LearningActivityType = (typeof LEARNING_ACTIVITY_TYPES)[number];
export const learningActivityType = pgEnum('learning_activity_type', LEARNING_ACTIVITY_TYPES);

export const learningActivities = pgTable(
  'learning_activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    learningSpaceId: uuid('learning_space_id')
      .notNull()
      .references(() => learningSpaces.id, { onDelete: 'cascade' }),
    type: learningActivityType('type').notNull().default('other'),
    name: text('name').notNull(),
    url: text('url'),
    position: integer('position'),
    opensAt: timestampColumn('opens_at'),
    dueAt: timestampColumn('due_at'),
    closesAt: timestampColumn('closes_at'),
    visible: boolean('visible').notNull().default(true),
    deletedAt,
    ...provenance,
    ...timestamps,
  },
  (table) => [
    externalIdUnique('learning_activities_external_id_unique_idx', table),
    index('learning_activities_space_idx')
      .on(table.learningSpaceId, table.position)
      .where(isNull(table.deletedAt)),
    index('learning_activities_due_at_idx')
      .on(table.institutionId, table.dueAt)
      .where(isNull(table.deletedAt)),
  ],
);

export const assessments = pgTable(
  'assessments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    learningSpaceId: uuid('learning_space_id')
      .notNull()
      .references(() => learningSpaces.id, { onDelete: 'cascade' }),
    learningActivityId: uuid('learning_activity_id').references(() => learningActivities.id, {
      onDelete: 'cascade',
    }),
    name: text('name').notNull(),
    maxPoints: numeric('max_points', { precision: 10, scale: 4 }),
    weight: numeric('weight', { precision: 10, scale: 4 }),
    countsTowardFinalGrade: boolean('counts_toward_final_grade').notNull().default(true),
    deletedAt,
    ...provenance,
    ...timestamps,
  },
  (table) => [
    externalIdUnique('assessments_external_id_unique_idx', table),
    index('assessments_space_idx').on(table.learningSpaceId).where(isNull(table.deletedAt)),
  ],
);

export const assessmentResults = pgTable(
  'assessment_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    assessmentId: uuid('assessment_id')
      .notNull()
      .references(() => assessments.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    points: numeric('points', { precision: 10, scale: 4 }),
    normalizedScore: numeric('normalized_score', { precision: 6, scale: 4 }),
    feedback: text('feedback'),
    gradedAt: timestampColumn('graded_at'),
    gradedById: uuid('graded_by_id').references(() => users.id, { onDelete: 'set null' }),
    deletedAt,
    ...provenance,
    ...timestamps,
  },
  (table) => [
    uniqueIndex('assessment_results_unique_idx')
      .on(table.assessmentId, table.userId)
      .where(isNull(table.deletedAt)),
    externalIdUnique('assessment_results_external_id_unique_idx', table),
    index('assessment_results_user_id_idx').on(table.userId).where(isNull(table.deletedAt)),
  ],
);

export const ACTIVITY_COMPLETION_STATES = [
  'incomplete',
  'complete',
  'complete_pass',
  'complete_fail',
] as const;
export type ActivityCompletionState = (typeof ACTIVITY_COMPLETION_STATES)[number];
export const activityCompletionState = pgEnum(
  'activity_completion_state',
  ACTIVITY_COMPLETION_STATES,
);

export const activityCompletions = pgTable(
  'activity_completions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    learningActivityId: uuid('learning_activity_id')
      .notNull()
      .references(() => learningActivities.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    state: activityCompletionState('state').notNull().default('incomplete'),
    completedAt: timestampColumn('completed_at'),
    deletedAt,
    ...provenance,
    ...timestamps,
  },
  (table) => [
    uniqueIndex('activity_completions_unique_idx')
      .on(table.learningActivityId, table.userId)
      .where(isNull(table.deletedAt)),
    externalIdUnique('activity_completions_external_id_unique_idx', table),
    index('activity_completions_user_id_idx').on(table.userId).where(isNull(table.deletedAt)),
  ],
);

export const SUBMISSION_STATES = ['draft', 'submitted', 'returned', 'graded'] as const;
export type SubmissionState = (typeof SUBMISSION_STATES)[number];
export const submissionState = pgEnum('submission_state', SUBMISSION_STATES);

export const submissionRefs = pgTable(
  'submission_refs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    learningActivityId: uuid('learning_activity_id')
      .notNull()
      .references(() => learningActivities.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    state: submissionState('state').notNull().default('draft'),
    attempt: integer('attempt').notNull().default(1),
    submittedAt: timestampColumn('submitted_at'),
    isLate: boolean('is_late').notNull().default(false),
    url: text('url'),
    fileCount: integer('file_count'),
    deletedAt,
    ...provenance,
    ...timestamps,
  },
  (table) => [
    uniqueIndex('submission_refs_unique_idx')
      .on(table.learningActivityId, table.userId, table.attempt)
      .where(isNull(table.deletedAt)),
    externalIdUnique('submission_refs_external_id_unique_idx', table),
    index('submission_refs_user_id_idx').on(table.userId).where(isNull(table.deletedAt)),
  ],
);

export type LearningSpace = typeof learningSpaces.$inferSelect;
export type NewLearningSpace = typeof learningSpaces.$inferInsert;
export type LearningActivity = typeof learningActivities.$inferSelect;
export type NewLearningActivity = typeof learningActivities.$inferInsert;
export type Assessment = typeof assessments.$inferSelect;
export type NewAssessment = typeof assessments.$inferInsert;
export type AssessmentResult = typeof assessmentResults.$inferSelect;
export type NewAssessmentResult = typeof assessmentResults.$inferInsert;
export type ActivityCompletion = typeof activityCompletions.$inferSelect;
export type NewActivityCompletion = typeof activityCompletions.$inferInsert;
export type SubmissionRef = typeof submissionRefs.$inferSelect;
export type NewSubmissionRef = typeof submissionRefs.$inferInsert;
