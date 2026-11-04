import { Injectable } from '@nestjs/common';

import type { QuizAttempt } from '../../database/schema';

import { AttemptQuestionsRepository } from './attempt-questions.repository';
import { attemptScoreOf, numberOf } from './attempt-score';
import { CompletionService } from './completion.service';
import { effectiveMarkOf } from './question-review';
import { QuizAttemptsRepository, type AttemptGrading } from './quiz-attempts.repository';
import { scaledPoints } from './quiz-grade';
import { QuizGradebookService } from './quiz-gradebook.service';

export interface Settling {
  readonly institutionId: string;
  readonly quizId: string;
  readonly userIds: readonly string[];
  readonly grading: AttemptGrading;
  readonly now: Date;
  readonly markerId?: string | null;
}

@Injectable()
export class QuizAttemptScoringService {
  constructor(
    private readonly attempts: QuizAttemptsRepository,
    private readonly questions: AttemptQuestionsRepository,
    private readonly gradebook: QuizGradebookService,
    private readonly completion: CompletionService,
  ) {}

  async rescore(attempt: QuizAttempt, grading: AttemptGrading): Promise<QuizAttempt> {
    const asked = await this.questions.ofAttempt(attempt.id);
    const score = attemptScoreOf(
      asked.map((question) =>
        effectiveMarkOf(numberOf(question.row.autoMark), numberOf(question.row.manualMark)),
      ),
      Number(attempt.maxMarks),
      grading.maxPoints,
    );

    return this.attempts.update(attempt.id, {
      rawMarks: score.rawMarks.toFixed(4),
      points: score.points === null ? null : score.points.toFixed(4),
      needsMarking: score.needsMarking,
    });
  }

  async settle(settling: Settling): Promise<void> {
    const { grading, now } = settling;
    for (const userId of new Set(settling.userIds)) {
      await this.gradebook.record(
        {
          institutionId: settling.institutionId,
          learningActivityId: settling.quizId,
          userId,
        },
        grading,
        now,
        settling.markerId ?? null,
      );
    }
    if (settling.userIds.length > 0) {
      await this.completion.recompute({ kind: 'quiz', id: settling.quizId }, [
        ...new Set(settling.userIds),
      ]);
    }
  }

  async rescoreAll(institutionId: string, quizId: string, now: Date): Promise<number> {
    await this.attempts.lockQuiz(quizId);
    const grading = await this.attempts.gradingOf(quizId);
    const finished = await this.attempts.finishedOfQuiz(quizId);

    for (const attempt of finished) {
      const points =
        grading.maxPoints === null || attempt.rawMarks === null
          ? null
          : scaledPoints(Number(attempt.rawMarks), Number(attempt.maxMarks), grading.maxPoints);
      if (numberOf(attempt.points) !== points) {
        await this.attempts.update(attempt.id, {
          points: points === null ? null : points.toFixed(4),
        });
      }
    }

    await this.settle({
      institutionId,
      quizId,
      userIds: finished.map((attempt) => attempt.userId),
      grading,
      now,
    });

    return finished.length;
  }
}
