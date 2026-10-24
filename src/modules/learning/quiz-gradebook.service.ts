import { Injectable } from '@nestjs/common';

import type { QuizAttempt } from '../../database/schema';

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
    if (grade === null) return;

    await this.results.record(
      {
        institutionId: student.institutionId,
        assessmentId: grading.assessmentId,
        userId: student.userId,
      },
      { points: grade, maxPoints: grading.maxPoints, markerId: null, now },
    );
  }
}
