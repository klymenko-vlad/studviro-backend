import { EXAM_TERM_KIND_ORDER, type ExamTermKind } from '../../database/schema';

/**
 * A retake seat is earned, not chosen. `first_retake` needs one failed attempt
 * behind it and `second_retake` two; a regular term and a state exam need none.
 *
 * The one copy of the rule: the write enforces it and the read explains it, and
 * neither keeps its own version.
 */
export function attemptsRequiredFor(kind: ExamTermKind): number {
  return EXAM_TERM_KIND_ORDER[kind];
}

export function laddersTo(kind: ExamTermKind, attemptsSpent: number): boolean {
  return attemptsSpent >= attemptsRequiredFor(kind);
}
