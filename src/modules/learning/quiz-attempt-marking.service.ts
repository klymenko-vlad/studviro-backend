import { Injectable } from '@nestjs/common';

import {
  ConflictError,
  EntityNotFoundError,
  InvalidInputError,
} from '../../common/errors/domain.error';
import { TransactionHost } from '../../database/transaction.host';

import { AttemptQuestionsRepository, type AskedQuestion } from './attempt-questions.repository';
import { EVERYTHING, reviewOf, type QuestionReview } from './attempt-review';
import { numberOf, scoreViewOf, type AttemptScoreView } from './attempt-score';
import { QuizAttemptAccessService, type QuizAt } from './quiz-attempt-access.service';
import { QuizAttemptClosingService } from './quiz-attempt-closing.service';
import {
  QuizAttemptPagesRepository,
  type StudentAttempt,
} from './quiz-attempt-pages.repository';
import { QuizAttemptScoringService } from './quiz-attempt-scoring.service';
import { QuizAttemptsRepository } from './quiz-attempts.repository';

export interface MarkedQuestion {
  readonly review: QuestionReview;
  readonly autoMark: number | null;
  readonly manualMark: number | null;
  readonly markedAt: Date | null;
}

export interface AttemptForMarking extends StudentAttempt {
  readonly score: AttemptScoreView;
  readonly questions: readonly MarkedQuestion[];
}

export interface QuestionMarkInput {
  readonly mark: number | null;
  readonly comment?: string | null;
}

@Injectable()
export class QuizAttemptMarkingService {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly access: QuizAttemptAccessService,
    private readonly attempts: QuizAttemptsRepository,
    private readonly pages: QuizAttemptPagesRepository,
    private readonly questions: AttemptQuestionsRepository,
    private readonly closing: QuizAttemptClosingService,
    private readonly scoring: QuizAttemptScoringService,
  ) {}

  async forMarking(
    at: QuizAt,
    attemptId: string,
    now = new Date(),
  ): Promise<AttemptForMarking> {
    await this.access.forAuthor(at);
    await this.closing.closeOverdue(now, { quizId: at.quizId });

    return this.view(at.quizId, attemptId);
  }

  async mark(
    at: QuizAt,
    attemptId: string,
    position: number,
    input: QuestionMarkInput,
    now = new Date(),
  ): Promise<AttemptForMarking> {
    const entry = await this.access.forAuthor(at);
    await this.closing.closeOverdue(now, { quizId: at.quizId });

    await this.txHost.run(async () => {
      const found = await this.attempts.inQuizOrFail(at.quizId, attemptId);
      const attempt = await this.attempts.lock(found.id);
      if (attempt.state !== 'finished') {
        throw new ConflictError(
          'QUIZ_ATTEMPT_NOT_FINISHED',
          'An attempt is marked once it has closed',
        );
      }

      const asked = await this.questions.at(attempt.id, position);
      if (!asked) throw new EntityNotFoundError('quiz_attempt_question', String(position));
      const comment = assertMark(asked, input);

      await this.questions.setManualMark(asked.row.id, {
        manualMark: input.mark,
        comment,
        markerId: at.userId,
        now,
      });
      const grading = await this.attempts.gradingOf(at.quizId);
      await this.scoring.rescore(attempt, grading);
      await this.scoring.settle({
        institutionId: entry.activity.institutionId,
        quizId: at.quizId,
        userIds: [attempt.userId],
        grading,
        now,
        markerId: at.userId,
      });
    });

    return this.view(at.quizId, attemptId);
  }

  private async view(quizId: string, attemptId: string): Promise<AttemptForMarking> {
    const [row, grading] = await Promise.all([
      this.pages.one(quizId, attemptId),
      this.attempts.gradingOf(quizId),
    ]);
    const asked =
      row.attempt.state === 'finished' ? await this.questions.ofAttempt(row.attempt.id) : [];

    return {
      ...row,
      score: scoreViewOf(row.attempt, grading.maxPoints ?? 0),
      questions: asked.map((question) => ({
        review: reviewOf(question, EVERYTHING),
        autoMark: numberOf(question.row.autoMark),
        manualMark: numberOf(question.row.manualMark),
        markedAt: question.row.markedAt,
      })),
    };
  }
}

function assertMark(asked: AskedQuestion, input: QuestionMarkInput): string | null {
  const comment = input.comment?.trim() ?? '';
  const outOf = Number(asked.row.mark);

  if (input.mark !== null && (input.mark < 0 || input.mark > outOf)) {
    throw new InvalidInputError(
      'QUIZ_MARK_OUT_OF_RANGE',
      'A mark is between nothing and what the question is worth',
      { mark: input.mark, outOf },
    );
  }
  if (input.mark !== null && asked.type !== 'essay' && comment === '') {
    throw new InvalidInputError(
      'QUIZ_OVERRIDE_REASON_REQUIRED',
      'Say why an automatic mark is changed',
    );
  }

  return comment === '' ? null : comment;
}
