import { Injectable } from '@nestjs/common';

import type { AssessmentResult, QuizAttempt } from '../../database/schema';

import { AssessmentResultsRepository } from './assessment-results.repository';
import { QuizAttemptsRepository, type AttemptGrading } from './quiz-attempts.repository';
import { quizGradeOf } from './quiz-grade';

@Injectable()
export class QuizGradebookService {
  constructor(
    private readonly attempts: QuizAttemptsRepository,
    private readonly results: AssessmentResultsRepository,
  ) {}

  async record(
    student: Pick<QuizAttempt, 'institutionId' | 'learningActivityId' | 'userId'>,
    grading: AttemptGrading,
    now: Date,
    markerId: string | null = null,
  ): Promise<void> {
    if (grading.assessmentId === null) return;

    const finished = await this.attempts.finishedOf(student.learningActivityId, student.userId);
    const grade = quizGradeOf(
      grading.gradingMethod,
      finished.map((attempt) => ({
        attempt: attempt.attempt,
        points: attempt.needsMarking || attempt.points === null ? null : Number(attempt.points),
      })),
    );
    const key = {
      institutionId: student.institutionId,
      assessmentId: grading.assessmentId,
      userId: student.userId,
    };
    if (grade === null) {
      await this.results.withdraw(key, now);

      return;
    }

    if (unchanged(await this.results.find(key), grade, grading.maxPoints)) return;

    await this.results.record(key, {
      points: grade,
      maxPoints: grading.maxPoints,
      markerId,
      now,
    });
  }
}

function unchanged(current: AssessmentResult | null, grade: number, maxPoints: number | null) {
  if (current?.points == null) return false;
  const normalized =
    maxPoints === null || maxPoints === 0 ? null : (grade / maxPoints).toFixed(4);

  return Number(current.points) === grade && current.normalizedScore === normalized;
}
