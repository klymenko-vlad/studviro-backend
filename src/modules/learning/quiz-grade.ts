import type { QuizGradingMethod } from '../../database/schema';

import { rounded } from './attempt-grading';

export interface GradedAttempt {
  readonly attempt: number;
  readonly points: number | null;
}

export function scaledPoints(rawMarks: number, maxMarks: number, maxPoints: number): number {
  if (maxMarks <= 0) return 0;

  return rounded((rawMarks / maxMarks) * maxPoints);
}

export function quizGradeOf(
  method: QuizGradingMethod,
  attempts: readonly GradedAttempt[],
): number | null {
  const marked = attempts.flatMap((attempt) =>
    attempt.points === null ? [] : [{ attempt: attempt.attempt, points: attempt.points }],
  );
  if (marked.length === 0) return null;

  switch (method) {
    case 'highest':
      return Math.max(...marked.map((attempt) => attempt.points));
    case 'last':
      return marked.reduce((last, attempt) => (attempt.attempt > last.attempt ? attempt : last))
        .points;
    case 'average':
      return rounded(marked.reduce((sum, attempt) => sum + attempt.points, 0) / marked.length);
  }
}
