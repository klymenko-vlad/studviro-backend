import { Injectable } from '@nestjs/common';

import type { QuizAttempt } from '../../database/schema';

import { showsQuestions } from './attempt-review';
import { scoreViewOf, type AttemptScoreView } from './attempt-score';
import { QuizAttemptAccessService, type QuizAt } from './quiz-attempt-access.service';
import { QuizAttemptClosingService } from './quiz-attempt-closing.service';
import {
  QuizAttemptPagesRepository,
  type AttemptPageQuery,
  type StudentAttempt,
} from './quiz-attempt-pages.repository';
import { QuizAttemptsRepository } from './quiz-attempts.repository';
import { startBlockOf, type StartBlock } from './quiz-policy';
import { reviewSettingsOf, reviewShownAt } from './quiz-review';

export interface Paged<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly limit: number;
  readonly total: number;
}

export interface AttemptStanding {
  readonly inProgressId: string | null;
  readonly used: number;
  readonly maxAttempts: number | null;
  readonly blockedBy: StartBlock | null;
}

export interface AttemptReviewState {
  readonly available: boolean;
  readonly score: AttemptScoreView | null;
}

export interface MyAttempt {
  readonly attempt: QuizAttempt;
  readonly review: AttemptReviewState;
}

export interface MyAttempts extends Paged<MyAttempt> {
  readonly standing: AttemptStanding;
}

@Injectable()
export class QuizAttemptListsService {
  constructor(
    private readonly access: QuizAttemptAccessService,
    private readonly attempts: QuizAttemptsRepository,
    private readonly pages: QuizAttemptPagesRepository,
    private readonly closing: QuizAttemptClosingService,
  ) {}

  async mine(at: QuizAt, query: AttemptPageQuery, now = new Date()): Promise<MyAttempts> {
    const { entry, quiz } = await this.access.forStudent(at, now);
    await this.closing.closeOverdue(now, { quizId: at.quizId, userId: at.userId });

    const [page, running, tally] = await Promise.all([
      this.pages.mine(at.quizId, at.userId, query),
      this.attempts.openAttempt(at.quizId, at.userId),
      this.attempts.tally(at.quizId, at.userId),
    ]);
    const { activity, totals } = entry;
    const shown = reviewShownAt(reviewSettingsOf(quiz), activity.dueAt, now);
    const reviewable = showsQuestions(shown) || shown.overallMark;
    const maxPoints = Number(entry.assessment.maxPoints);

    return {
      items: page.rows.map((attempt) => {
        const finished = attempt.state === 'finished';

        return {
          attempt,
          review: {
            available: finished && reviewable,
            score: finished && shown.overallMark ? scoreViewOf(attempt, maxPoints) : null,
          },
        };
      }),
      page: query.page,
      limit: query.limit,
      total: page.total,
      standing: {
        inProgressId: running?.id ?? null,
        used: tally.used,
        maxAttempts: activity.maxAttempts,
        blockedBy: running
          ? null
          : startBlockOf(
              {
                window: { opensAt: activity.opensAt, closesAt: activity.dueAt },
                maxAttempts: activity.maxAttempts,
                used: tally.used,
                questionCount: totals?.questionCount ?? 0,
              },
              now,
            ),
      },
    };
  }

  async all(
    at: QuizAt,
    query: AttemptPageQuery,
    now = new Date(),
  ): Promise<Paged<StudentAttempt>> {
    await this.access.forAuthor(at);
    await this.closing.closeOverdue(now, { quizId: at.quizId });

    const page = await this.pages.all(at.quizId, query);

    return { items: page.rows, page: query.page, limit: query.limit, total: page.total };
  }
}
