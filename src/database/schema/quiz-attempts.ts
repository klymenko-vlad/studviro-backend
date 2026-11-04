import { sql } from 'drizzle-orm';
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

import { timestampColumn, timestamps } from './_shared';
import { institutionId } from './institutions';
import type { AttemptResponse, PresentedOrder } from './quiz-attempt-response';
import { questionVersions, quizSlots, quizzes } from './quizzes';
import { users } from './users';

export const QUIZ_ATTEMPT_PROGRESS = ['in_progress', 'finished'] as const;
export type QuizAttemptProgress = (typeof QUIZ_ATTEMPT_PROGRESS)[number];
export const quizAttemptProgress = pgEnum('quiz_attempt_progress', QUIZ_ATTEMPT_PROGRESS);

export const QUIZ_DEADLINE_CAUSES = ['time_limit', 'quiz_close'] as const;
export type QuizDeadlineCause = (typeof QUIZ_DEADLINE_CAUSES)[number];
export const quizDeadlineCause = pgEnum('quiz_deadline_cause', QUIZ_DEADLINE_CAUSES);

export const QUIZ_ATTEMPT_CLOSERS = ['student', ...QUIZ_DEADLINE_CAUSES] as const;
export type QuizAttemptCloser = (typeof QUIZ_ATTEMPT_CLOSERS)[number];
export const quizAttemptCloser = pgEnum('quiz_attempt_closer', QUIZ_ATTEMPT_CLOSERS);

export const quizAttempts = pgTable(
  'quiz_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    learningActivityId: uuid('learning_activity_id')
      .notNull()
      .references(() => quizzes.learningActivityId, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    attempt: integer('attempt').notNull(),
    state: quizAttemptProgress('state').notNull().default('in_progress'),
    startedAt: timestampColumn('started_at').notNull(),
    deadlineAt: timestampColumn('deadline_at'),
    deadlineCause: quizDeadlineCause('deadline_cause'),
    finishedAt: timestampColumn('finished_at'),
    closedBy: quizAttemptCloser('closed_by'),
    missingQuestions: integer('missing_questions').notNull().default(0),
    maxMarks: numeric('max_marks', { precision: 10, scale: 4 }).notNull(),
    rawMarks: numeric('raw_marks', { precision: 10, scale: 4 }),
    points: numeric('points', { precision: 10, scale: 4 }),
    needsMarking: boolean('needs_marking').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('quiz_attempts_number_idx').on(
      table.learningActivityId,
      table.userId,
      table.attempt,
    ),
    uniqueIndex('quiz_attempts_one_open_idx')
      .on(table.learningActivityId, table.userId)
      .where(sql`${table.state} = 'in_progress'`),
    index('quiz_attempts_quiz_idx').on(table.learningActivityId, table.startedAt),
    index('quiz_attempts_overdue_idx')
      .on(table.deadlineAt)
      .where(sql`${table.state} = 'in_progress'`),
    check('quiz_attempts_attempt_positive', sql`${table.attempt} >= 1`),
    check(
      'quiz_attempts_finished_shape',
      sql`(${table.state} = 'in_progress' and ${table.finishedAt} is null and ${table.closedBy} is null)
        or (${table.state} = 'finished' and ${table.finishedAt} is not null and ${table.closedBy} is not null)`,
    ),
  ],
);

export const quizAttemptQuestions = pgTable(
  'quiz_attempt_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: institutionId(),
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => quizAttempts.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    slotId: uuid('slot_id').references(() => quizSlots.id, { onDelete: 'set null' }),
    questionVersionId: uuid('question_version_id')
      .notNull()
      .references(() => questionVersions.id, { onDelete: 'cascade' }),
    mark: numeric('mark', { precision: 10, scale: 4 }).notNull(),
    presentedOrder: jsonb('presented_order').$type<PresentedOrder>(),
    response: jsonb('response').$type<AttemptResponse>(),
    answeredAt: timestampColumn('answered_at'),
    autoMark: numeric('auto_mark', { precision: 10, scale: 4 }),
    manualMark: numeric('manual_mark', { precision: 10, scale: 4 }),
    markedById: uuid('marked_by_id').references(() => users.id, { onDelete: 'set null' }),
    markedAt: timestampColumn('marked_at'),
    comment: text('comment'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('quiz_attempt_questions_position_idx').on(table.attemptId, table.position),
    index('quiz_attempt_questions_slot_idx').on(table.slotId),
    check('quiz_attempt_questions_mark_positive', sql`${table.mark} > 0`),
    check(
      'quiz_attempt_questions_manual_mark_range',
      sql`${table.manualMark} is null or (${table.manualMark} >= 0 and ${table.manualMark} <= ${table.mark})`,
    ),
  ],
);

export type QuizAttempt = typeof quizAttempts.$inferSelect;
export type QuizAttemptQuestion = typeof quizAttemptQuestions.$inferSelect;
