/**
 * Registration for an exam term closes when the registrar says, and at the latest
 * when the exam starts. A term entered with no close date is not open for ever: a
 * student cannot sign up for, or back out of, an exam that has already begun.
 *
 * The one copy of the rule: the write enforces it and the read explains it.
 */
export function registrationClosesAt(term: {
  readonly registrationClosesAt: Date | null;
  readonly startsAt: Date;
}): Date {
  return term.registrationClosesAt ?? term.startsAt;
}
