import { Injectable } from '@nestjs/common';

import { ConflictError, EntityNotFoundError } from '../../common/errors/domain.error';
import type { QuizAttempt, QuizAttemptQuestion, QuizLayout } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import { deadlineOf, isOverdue } from './attempt-clock';
import { AttemptQuestionsRepository, type AskedQuestion } from './attempt-questions.repository';
import { responseOf, type AnswerInput } from './attempt-response';
import {
  QuizAttemptAccessService,
  type OpenQuiz,
  type QuizAt,
} from './quiz-attempt-access.service';
import { QuizAttemptBuilder } from './quiz-attempt-builder';
import { QuizAttemptClosingService } from './quiz-attempt-closing.service';
import { QuizAttemptsRepository } from './quiz-attempts.repository';
import { startBlockOf, type StartBlock } from './quiz-policy';

export interface AttemptView {
  readonly attempt: QuizAttempt;
  readonly layout: QuizLayout;
  readonly questions: readonly AskedQuestion[];
  readonly now: Date;
}

export interface SavedAnswer {
  readonly attempt: QuizAttempt;
  readonly question: QuizAttemptQuestion;
  readonly now: Date;
}

const REFUSALS: Record<StartBlock, { code: string; message: string }> = {
  upcoming: { code: 'QUIZ_NOT_OPEN_YET', message: 'This quiz has not opened yet' },
  closed: { code: 'QUIZ_CLOSED', message: 'This quiz has closed' },
  no_attempts_left: {
    code: 'QUIZ_NO_ATTEMPTS_LEFT',
    message: 'You have used every attempt this quiz allows',
  },
  no_questions: { code: 'QUIZ_HAS_NO_QUESTIONS', message: 'This quiz has no questions yet' },
};

@Injectable()
export class QuizAttemptsService {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly access: QuizAttemptAccessService,
    private readonly attempts: QuizAttemptsRepository,
    private readonly questions: AttemptQuestionsRepository,
    private readonly builder: QuizAttemptBuilder,
    private readonly closing: QuizAttemptClosingService,
  ) {}

  async start(at: QuizAt, now = new Date()): Promise<AttemptView> {
    const open = await this.access.forStudent(at, now);
    await this.closing.closeOverdue(now, { quizId: at.quizId, userId: at.userId });

    const attempt = await this.txHost.run(async () => {
      await this.attempts.lockStarting(at.quizId, at.userId);
      const running = await this.attempts.openAttempt(at.quizId, at.userId);
      if (running) return running;

      return this.begin(open, at.userId, now);
    });

    return this.viewOf(open, attempt, now);
  }

  async view(at: QuizAt, attemptId: string, now = new Date()): Promise<AttemptView> {
    const open = await this.access.forStudent(at, now);

    return this.viewOf(open, await this.current(at, attemptId, now), now);
  }

  async save(
    at: QuizAt,
    attemptId: string,
    position: number,
    input: AnswerInput,
    now = new Date(),
  ): Promise<SavedAnswer> {
    await this.access.forStudent(at, now);
    const owned = await this.attempts.ownedOrFail(at.quizId, attemptId, at.userId);

    const saved = await this.txHost.run(async () => {
      const attempt = await this.attempts.lock(owned.id);
      if (attempt.state !== 'in_progress' || isOverdue(attempt.deadlineAt, now)) return null;

      const asked = await this.questions.at(attempt.id, position);
      if (!asked) throw new EntityNotFoundError('quiz_attempt_question', String(position));

      const response = responseOf(asked.type, asked.row.presentedOrder, input);
      const question = await this.questions.saveResponse(asked.row.id, response, now);

      return { attempt, question, now };
    });
    if (saved) return saved;

    await this.closing.close(owned.id, 'deadline', now);
    throw new ConflictError(
      'QUIZ_ATTEMPT_CLOSED',
      'This attempt has closed; answers can no longer be changed',
    );
  }

  async submit(at: QuizAt, attemptId: string, now = new Date()): Promise<AttemptView> {
    const open = await this.access.forStudent(at, now);
    const owned = await this.attempts.ownedOrFail(at.quizId, attemptId, at.userId);
    const closed = await this.closing.close(owned.id, 'student', now);

    return this.viewOf(open, closed, now);
  }

  private async begin(open: OpenQuiz, userId: string, now: Date): Promise<QuizAttempt> {
    const { activity, totals } = open.entry;
    const tally = await this.attempts.tally(activity.id, userId);
    const block = startBlockOf(
      {
        window: { opensAt: activity.opensAt, closesAt: activity.dueAt },
        maxAttempts: activity.maxAttempts,
        used: tally.used,
        questionCount: totals?.questionCount ?? 0,
      },
      now,
    );
    if (block) throw new ConflictError(REFUSALS[block].code, REFUSALS[block].message);

    const plan = await this.builder.plan(activity.learningSpaceId, open.quiz);
    if (plan.questions.length === 0) {
      const refusal = REFUSALS.no_questions;
      throw new ConflictError(refusal.code, refusal.message);
    }

    const deadline = deadlineOf(now, open.quiz.timeLimitSeconds, activity.dueAt);
    const attempt = await this.attempts.insert({
      institutionId: activity.institutionId,
      learningActivityId: activity.id,
      userId,
      attempt: tally.lastNumber + 1,
      startedAt: now,
      deadlineAt: deadline.deadlineAt,
      deadlineCause: deadline.cause,
      missingQuestions: plan.missing,
      maxMarks: plan.maxMarks.toFixed(4),
    });
    await this.questions.insert(
      plan.questions.map((question) => ({
        ...question,
        institutionId: activity.institutionId,
        attemptId: attempt.id,
      })),
    );

    return attempt;
  }

  private async current(at: QuizAt, attemptId: string, now: Date): Promise<QuizAttempt> {
    const attempt = await this.attempts.ownedOrFail(at.quizId, attemptId, at.userId);
    if (attempt.state === 'in_progress' && isOverdue(attempt.deadlineAt, now)) {
      return this.closing.close(attempt.id, 'deadline', now);
    }

    return attempt;
  }

  private async viewOf(open: OpenQuiz, attempt: QuizAttempt, now: Date): Promise<AttemptView> {
    const questions =
      attempt.state === 'in_progress' ? await this.questions.ofAttempt(attempt.id) : [];

    return { attempt, layout: open.quiz.layout, questions, now };
  }
}
