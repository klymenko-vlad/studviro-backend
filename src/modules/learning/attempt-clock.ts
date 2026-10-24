import type { QuizDeadlineCause } from '../../database/schema';

export interface AttemptDeadline {
  readonly deadlineAt: Date | null;
  readonly cause: QuizDeadlineCause | null;
}

export function deadlineOf(
  startedAt: Date,
  timeLimitSeconds: number | null,
  closesAt: Date | null,
): AttemptDeadline {
  const limitEnds =
    timeLimitSeconds === null ? null : new Date(startedAt.getTime() + timeLimitSeconds * 1000);

  if (limitEnds !== null && (closesAt === null || limitEnds.getTime() <= closesAt.getTime())) {
    return { deadlineAt: limitEnds, cause: 'time_limit' };
  }
  if (closesAt !== null) return { deadlineAt: closesAt, cause: 'quiz_close' };

  return { deadlineAt: null, cause: null };
}

export function isOverdue(deadlineAt: Date | null, now: Date): boolean {
  return deadlineAt !== null && now.getTime() >= deadlineAt.getTime();
}

export function remainingSeconds(deadlineAt: Date | null, now: Date): number | null {
  if (deadlineAt === null) return null;

  return Math.max(0, Math.floor((deadlineAt.getTime() - now.getTime()) / 1000));
}
