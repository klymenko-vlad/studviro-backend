import { isNull, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { deletedAt, scanStatusColumn, timestampColumn, timestamps } from './_shared';
import { courseOfferings } from './academic-structure';
import { institutionId } from './institutions';
import type { Restriction } from './learning-restrictions';
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
    summary: text('summary'),
    visible: boolean('visible').notNull().default(true),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    uniqueIndex('learning_spaces_offering_unique_idx')
      .on(table.courseOfferingId)
      .where(isNull(table.deletedAt)),
  ],
);

export const learningSections = pgTable(
  'learning_sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    learningSpaceId: uuid('learning_space_id')
      .notNull()
      .references(() => learningSpaces.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    summary: text('summary'),
    position: integer('position').notNull().default(0),
    visible: boolean('visible').notNull().default(true),
    availableFrom: timestampColumn('available_from'),
    availableUntil: timestampColumn('available_until'),
    hiddenUntilAvailable: boolean('hidden_until_available').notNull().default(false),
    restriction: jsonb('restriction').$type<Restriction>(),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    index('learning_sections_space_idx')
      .on(table.learningSpaceId, table.position)
      .where(isNull(table.deletedAt)),
  ],
);

export const COMPLETION_RULES = [
  'none',
  'manual',
  'viewed',
  'submitted',
  'marked',
  'passed',
] as const;
export type CompletionRule = (typeof COMPLETION_RULES)[number];
export const completionRule = pgEnum('completion_rule', COMPLETION_RULES);

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
    sectionId: uuid('section_id').references(() => learningSections.id, {
      onDelete: 'set null',
    }),
    type: learningActivityType('type').notNull().default('other'),
    name: text('name').notNull(),
    brief: text('brief'),
    position: integer('position'),
    opensAt: timestampColumn('opens_at'),
    dueAt: timestampColumn('due_at'),
    closesAt: timestampColumn('closes_at'),
    maxAttempts: integer('max_attempts'),
    allowsLateSubmission: boolean('allows_late_submission').notNull().default(false),
    visible: boolean('visible').notNull().default(true),
    availableFrom: timestampColumn('available_from'),
    availableUntil: timestampColumn('available_until'),
    hiddenUntilAvailable: boolean('hidden_until_available').notNull().default(false),
    restriction: jsonb('restriction').$type<Restriction>(),
    announcedAt: timestampColumn('announced_at'),
    completionRule: completionRule('completion_rule').notNull().default('none'),
    completionPassPoints: numeric('completion_pass_points', { precision: 10, scale: 4 }),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    index('learning_activities_space_idx')
      .on(table.learningSpaceId, table.position)
      .where(isNull(table.deletedAt)),
    index('learning_activities_due_at_idx')
      .on(table.institutionId, table.dueAt)
      .where(isNull(table.deletedAt)),
    index('learning_activities_unannounced_idx')
      .on(table.dueAt)
      .where(sql`${table.announcedAt} is null and ${table.deletedAt} is null`),
  ],
);

export const LEARNING_MATERIAL_KINDS = [
  'file',
  'link',
  'text',
  'page',
  'label',
  'video',
  'folder',
] as const;
export type LearningMaterialKind = (typeof LEARNING_MATERIAL_KINDS)[number];
export const learningMaterialKind = pgEnum('learning_material_kind', LEARNING_MATERIAL_KINDS);

export const learningMaterials = pgTable(
  'learning_materials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    learningSpaceId: uuid('learning_space_id')
      .notNull()
      .references(() => learningSpaces.id, { onDelete: 'cascade' }),
    sectionId: uuid('section_id').references(() => learningSections.id, {
      onDelete: 'set null',
    }),
    kind: learningMaterialKind('kind').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    body: text('body'),
    url: text('url'),
    storageKey: text('storage_key'),
    filename: text('filename'),
    contentType: text('content_type'),
    sizeBytes: integer('size_bytes'),
    scanStatus: scanStatusColumn(),
    position: integer('position').notNull().default(0),
    visible: boolean('visible').notNull().default(true),
    availableFrom: timestampColumn('available_from'),
    availableUntil: timestampColumn('available_until'),
    hiddenUntilAvailable: boolean('hidden_until_available').notNull().default(false),
    restriction: jsonb('restriction').$type<Restriction>(),
    completionRule: completionRule('completion_rule').notNull().default('none'),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    index('learning_materials_scan_pending_idx')
      .on(table.storageKey)
      .where(sql`${table.scanStatus} = 'pending'`),
    index('learning_materials_space_idx')
      .on(table.learningSpaceId, table.position)
      .where(isNull(table.deletedAt)),
  ],
);

export const learningMaterialFiles = pgTable(
  'learning_material_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    learningMaterialId: uuid('learning_material_id')
      .notNull()
      .references(() => learningMaterials.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key'),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes'),
    scanStatus: scanStatusColumn(),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    index('learning_material_files_scan_pending_idx')
      .on(table.storageKey)
      .where(sql`${table.scanStatus} = 'pending'`),
    index('learning_material_files_material_idx')
      .on(table.learningMaterialId, table.filename)
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
    ...timestamps,
  },
  (table) => [
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
    ...timestamps,
  },
  (table) => [
    uniqueIndex('assessment_results_unique_idx')
      .on(table.assessmentId, table.userId)
      .where(isNull(table.deletedAt)),
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
    learningActivityId: uuid('learning_activity_id').references(() => learningActivities.id, {
      onDelete: 'cascade',
    }),
    learningMaterialId: uuid('learning_material_id').references(() => learningMaterials.id, {
      onDelete: 'cascade',
    }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    state: activityCompletionState('state').notNull().default('incomplete'),
    completedAt: timestampColumn('completed_at'),
    viewedAt: timestampColumn('viewed_at'),
    markedDoneAt: timestampColumn('marked_done_at'),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    uniqueIndex('activity_completions_unique_idx')
      .on(table.learningActivityId, table.userId)
      .where(isNull(table.deletedAt)),
    uniqueIndex('activity_completions_material_unique_idx')
      .on(table.learningMaterialId, table.userId)
      .where(isNull(table.deletedAt)),
    index('activity_completions_user_id_idx').on(table.userId).where(isNull(table.deletedAt)),
    check(
      'activity_completions_one_item',
      sql`num_nonnulls(${table.learningActivityId}, ${table.learningMaterialId}) = 1`,
    ),
  ],
);

export const SUBMISSION_STATES = ['draft', 'submitted', 'returned', 'graded'] as const;
export type SubmissionState = (typeof SUBMISSION_STATES)[number];
export const submissionState = pgEnum('submission_state', SUBMISSION_STATES);

export const submissions = pgTable(
  'submissions',
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
    notes: text('notes'),
    fileCount: integer('file_count').notNull().default(0),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    uniqueIndex('submissions_unique_idx')
      .on(table.learningActivityId, table.userId, table.attempt)
      .where(isNull(table.deletedAt)),
    index('submissions_user_id_idx').on(table.userId).where(isNull(table.deletedAt)),
  ],
);

export const submissionFiles = pgTable(
  'submission_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => submissions.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull(),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    scanStatus: scanStatusColumn(),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    index('submission_files_scan_pending_idx')
      .on(table.storageKey)
      .where(sql`${table.scanStatus} = 'pending'`),
    index('submission_files_submission_idx')
      .on(table.submissionId)
      .where(isNull(table.deletedAt)),
  ],
);

export type LearningSpace = typeof learningSpaces.$inferSelect;
export type NewLearningSpace = typeof learningSpaces.$inferInsert;
export type LearningSection = typeof learningSections.$inferSelect;
export type LearningMaterialFile = typeof learningMaterialFiles.$inferSelect;
export type LearningActivity = typeof learningActivities.$inferSelect;
export type NewLearningActivity = typeof learningActivities.$inferInsert;
export type LearningMaterial = typeof learningMaterials.$inferSelect;
export type NewLearningMaterial = typeof learningMaterials.$inferInsert;
export type Assessment = typeof assessments.$inferSelect;
export type NewAssessment = typeof assessments.$inferInsert;
export type AssessmentResult = typeof assessmentResults.$inferSelect;
export type NewAssessmentResult = typeof assessmentResults.$inferInsert;
export type ActivityCompletion = typeof activityCompletions.$inferSelect;
export type NewActivityCompletion = typeof activityCompletions.$inferInsert;
export type Submission = typeof submissions.$inferSelect;
export type NewSubmission = typeof submissions.$inferInsert;
export type SubmissionFile = typeof submissionFiles.$inferSelect;
export type NewSubmissionFile = typeof submissionFiles.$inferInsert;
