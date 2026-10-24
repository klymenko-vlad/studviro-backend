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

import { deletedAt, timestampColumn, timestamps } from './_shared';
import { institutionId } from './institutions';
import { learningActivities, learningSpaces } from './learning';
import type { QuestionAnswerKey } from './question-answer-key';
import { users } from './users';

export const QUESTION_TYPES = [
  'single_choice',
  'multiple_choice',
  'true_false',
  'short_answer',
  'numerical',
  'matching',
  'essay',
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
export const questionType = pgEnum('question_type', QUESTION_TYPES);

export const questionCategories = pgTable(
  'question_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    learningSpaceId: uuid('learning_space_id')
      .notNull()
      .references(() => learningSpaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    index('question_categories_space_idx')
      .on(table.learningSpaceId, table.name)
      .where(isNull(table.deletedAt)),
  ],
);

export const questions = pgTable(
  'questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    learningSpaceId: uuid('learning_space_id')
      .notNull()
      .references(() => learningSpaces.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => questionCategories.id, { onDelete: 'cascade' }),
    type: questionType('type').notNull(),
    latestVersion: integer('latest_version').notNull().default(1),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    deletedAt,
    ...timestamps,
  },
  (table) => [
    index('questions_category_idx').on(table.categoryId).where(isNull(table.deletedAt)),
    index('questions_space_idx')
      .on(table.learningSpaceId, table.createdAt)
      .where(isNull(table.deletedAt)),
  ],
);

export const questionVersions = pgTable(
  'question_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    name: text('name').notNull(),
    text: text('text').notNull(),
    defaultMark: numeric('default_mark', { precision: 10, scale: 4 }).notNull(),
    generalFeedback: text('general_feedback'),
    answerKey: jsonb('answer_key').$type<QuestionAnswerKey>().notNull(),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestampColumn('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('question_versions_unique_idx').on(table.questionId, table.version),
    check('question_versions_version_positive', sql`${table.version} >= 1`),
  ],
);

export const QUIZ_GRADING_METHODS = ['highest', 'last', 'average'] as const;
export type QuizGradingMethod = (typeof QUIZ_GRADING_METHODS)[number];
export const quizGradingMethod = pgEnum('quiz_grading_method', QUIZ_GRADING_METHODS);

export const quizzes = pgTable('quizzes', {
  learningActivityId: uuid('learning_activity_id')
    .primaryKey()
    .references(() => learningActivities.id, { onDelete: 'cascade' }),
  institutionId: institutionId(),
  timeLimitSeconds: integer('time_limit_seconds'),
  gradingMethod: quizGradingMethod('grading_method').notNull().default('highest'),
  shuffleQuestions: boolean('shuffle_questions').notNull().default(false),
  shuffleChoices: boolean('shuffle_choices').notNull().default(true),
  ...timestamps,
});

export const QUIZ_SLOT_KINDS = ['question', 'random'] as const;
export type QuizSlotKind = (typeof QUIZ_SLOT_KINDS)[number];
export const quizSlotKind = pgEnum('quiz_slot_kind', QUIZ_SLOT_KINDS);

export const quizSlots = pgTable(
  'quiz_slots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    learningActivityId: uuid('learning_activity_id')
      .notNull()
      .references(() => quizzes.learningActivityId, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    kind: quizSlotKind('kind').notNull(),
    questionId: uuid('question_id').references(() => questions.id, { onDelete: 'no action' }),
    categoryId: uuid('category_id').references(() => questionCategories.id, {
      onDelete: 'no action',
    }),
    pickCount: integer('pick_count'),
    mark: numeric('mark', { precision: 10, scale: 4 }).notNull(),
    ...timestamps,
  },
  (table) => [
    index('quiz_slots_quiz_idx').on(table.learningActivityId, table.position),
    index('quiz_slots_question_idx').on(table.questionId),
    index('quiz_slots_category_idx').on(table.categoryId),
    check(
      'quiz_slots_kind_shape',
      sql`(${table.kind} = 'question' and ${table.questionId} is not null and ${table.categoryId} is null and ${table.pickCount} is null)
        or (${table.kind} = 'random' and ${table.questionId} is null and ${table.categoryId} is not null and ${table.pickCount} >= 1)`,
    ),
    check('quiz_slots_mark_positive', sql`${table.mark} > 0`),
  ],
);

export type QuestionCategory = typeof questionCategories.$inferSelect;
export type Question = typeof questions.$inferSelect;
export type QuestionVersion = typeof questionVersions.$inferSelect;
export type Quiz = typeof quizzes.$inferSelect;
export type QuizSlot = typeof quizSlots.$inferSelect;
