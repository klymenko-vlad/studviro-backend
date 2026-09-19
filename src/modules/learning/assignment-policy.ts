import { ConflictError, InvalidInputError } from '../../common/errors/domain.error';

export interface AssignmentWindow {
  readonly opensAt?: Date | null;
  readonly dueAt?: Date | null;
  readonly closesAt?: Date | null;
}

export interface AttemptPolicy extends AssignmentWindow {
  readonly maxAttempts: number | null;
  readonly allowsLateSubmission: boolean;
}

export const MAX_ATTEMPT_LIMIT = 100;

export function assertWindow({ opensAt, dueAt, closesAt }: AssignmentWindow): void {
  const ordered: [string, Date][] = [
    ['opensAt', opensAt],
    ['dueAt', dueAt],
    ['closesAt', closesAt],
  ].filter((pair): pair is [string, Date] => pair[1] instanceof Date);

  ordered.reduce<[string, Date] | undefined>((earlier, later) => {
    if (earlier && earlier[1].getTime() > later[1].getTime()) {
      throw new InvalidInputError(
        'ASSIGNMENT_WINDOW_INVALID',
        'An assignment opens, then falls due, then closes — in that order',
        { earlier: earlier[0], later: later[0] },
      );
    }

    return later;
  }, undefined);
}

export function assertAttemptPolicy(maxAttempts: number | null): void {
  if (maxAttempts === null) return;

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > MAX_ATTEMPT_LIMIT) {
    throw new InvalidInputError(
      'ASSIGNMENT_ATTEMPT_LIMIT_INVALID',
      `An attempt limit is between 1 and ${MAX_ATTEMPT_LIMIT}, or absent for unlimited`,
      { maxAttempts },
    );
  }
}

/**
 * Whether this student may hand in now, and whether what they hand in is late.
 *
 * Lateness is derived here from `dueAt` and the server's clock and is never
 * accepted from a client: a value a submitter controls is not a fact about
 * when they submitted.
 */
export function assertSubmittable(
  policy: AttemptPolicy,
  attemptsUsed: number,
  now: Date,
): { isLate: boolean } {
  if (policy.opensAt && now.getTime() < policy.opensAt.getTime()) {
    throw new ConflictError('ASSIGNMENT_NOT_OPEN', 'This assignment has not opened yet', {
      opensAt: policy.opensAt.toISOString(),
    });
  }

  const closesAt = effectiveClose(policy);
  if (closesAt && now.getTime() > closesAt.getTime()) {
    throw new ConflictError('ASSIGNMENT_CLOSED', 'This assignment is closed', {
      closesAt: closesAt.toISOString(),
    });
  }

  const isLate =
    policy.dueAt !== null && policy.dueAt !== undefined
      ? now.getTime() > policy.dueAt.getTime()
      : false;

  if (isLate && !policy.allowsLateSubmission) {
    throw new ConflictError(
      'ASSIGNMENT_LATE_NOT_ALLOWED',
      'This assignment does not accept late work',
    );
  }

  if (policy.maxAttempts !== null && attemptsUsed >= policy.maxAttempts) {
    throw new ConflictError(
      'ASSIGNMENT_ATTEMPTS_EXHAUSTED',
      'You have used every attempt on this assignment',
      { maxAttempts: policy.maxAttempts, attemptsUsed },
    );
  }

  return { isLate };
}

/**
 * With no explicit close, the due date closes the assignment unless late work
 * is accepted — otherwise "late but not allowed" would be the only thing
 * standing between a student and a submission nobody will ever mark.
 */
function effectiveClose(policy: AttemptPolicy): Date | null {
  if (policy.closesAt) return policy.closesAt;

  return policy.allowsLateSubmission ? null : (policy.dueAt ?? null);
}
