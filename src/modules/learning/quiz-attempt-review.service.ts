import { Injectable } from '@nestjs/common';

import { ConflictError } from '../../common/errors/domain.error';
import type { QuizAttempt } from '../../database/schema';

import { isOverdue } from './attempt-clock';
import { AttemptQuestionsRepository } from './attempt-questions.repository';
import { reviewOf, showsQuestions, type QuestionReview } from './attempt-review';
import { scoreViewOf, type AttemptScoreView } from './attempt-score';
import { QuizAttemptAccessService, type QuizAt } from './quiz-attempt-access.service';
import { QuizAttemptClosingService } from './quiz-attempt-closing.service';
import { QuizAttemptsRepository } from './quiz-attempts.repository';
import { nextRevealOf, reviewSettingsOf, reviewShownAt, type ReviewShown } from './quiz-review';

export interface AttemptReview {
  readonly attempt: QuizAttempt;
  readonly shown: ReviewShown;
  readonly revealsAt: Date | null;
  readonly score: AttemptScoreView | null;
  readonly questions: readonly QuestionReview[];
}

@Injectable()
export class QuizAttemptReviewService {
  constructor(
    private readonly access: QuizAttemptAccessService,
    private readonly attempts: QuizAttemptsRepository,
    private readonly questions: AttemptQuestionsRepository,
    private readonly closing: QuizAttemptClosingService,
  ) {}

  async review(at: QuizAt, attemptId: string, now = new Date()): Promise<AttemptReview> {
    const { entry, quiz } = await this.access.forStudent(at, now);
    let attempt = await this.attempts.ownedOrFail(at.quizId, attemptId, at.userId);
    if (attempt.state === 'in_progress' && isOverdue(attempt.deadlineAt, now)) {
      attempt = await this.closing.close(attempt.id, 'deadline', now);
    }
    if (attempt.state === 'in_progress') {
      throw new ConflictError(
        'QUIZ_ATTEMPT_IN_PROGRESS',
        'This attempt is still running; it can be reviewed once it has closed',
      );
    }

    const settings = reviewSettingsOf(quiz);
    const closesAt = entry.activity.dueAt;
    const shown = reviewShownAt(settings, closesAt, now);
    const asked = showsQuestions(shown) ? await this.questions.ofAttempt(attempt.id) : [];

    return {
      attempt,
      shown,
      revealsAt: nextRevealOf(settings, closesAt, now),
      score: shown.overallMark
        ? scoreViewOf(attempt, Number(entry.assessment.maxPoints))
        : null,
      questions: asked.map((question) => reviewOf(question, shown)),
    };
  }
}
