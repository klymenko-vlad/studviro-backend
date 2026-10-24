import type { QuizAttempt } from '../../database/schema';

import { rounded } from './attempt-grading';
import { scaledPoints } from './quiz-grade';

export interface AttemptScore {
  readonly rawMarks: number;
  readonly points: number | null;
  readonly needsMarking: boolean;
}

export function attemptScoreOf(
  marks: readonly (number | null)[],
  maxMarks: number,
  maxPoints: number | null,
): AttemptScore {
  const rawMarks = rounded(marks.reduce<number>((sum, mark) => sum + (mark ?? 0), 0));

  return {
    rawMarks,
    points: maxPoints === null ? null : scaledPoints(rawMarks, maxMarks, maxPoints),
    needsMarking: marks.includes(null),
  };
}

export interface AttemptScoreView {
  readonly rawMarks: number | null;
  readonly maxMarks: number;
  readonly points: number | null;
  readonly maxPoints: number;
  readonly awaitingMarking: boolean;
}

export function scoreViewOf(attempt: QuizAttempt, maxPoints: number): AttemptScoreView {
  const awaitingMarking = attempt.needsMarking;

  return {
    rawMarks: awaitingMarking || attempt.rawMarks === null ? null : Number(attempt.rawMarks),
    maxMarks: Number(attempt.maxMarks),
    points: awaitingMarking || attempt.points === null ? null : Number(attempt.points),
    maxPoints,
    awaitingMarking,
  };
}

export function numberOf(value: string | null): number | null {
  return value === null ? null : Number(value);
}
