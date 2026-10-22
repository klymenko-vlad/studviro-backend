import type { StudyProgress } from './study-progress';

/**
 * The European norm, and the only defensible default: one academic year of
 * full-time study is 60 ECTS, so a semester is 30.
 *
 * It is a default, not a rule. A programme that wants to state its own total
 * should carry one, and that is a column on `programs` rather than a constant
 * here — recorded as the follow-up in ADR 0029.
 */
const CREDITS_PER_SEMESTER = 30;

export interface ProgrammeEnrolment {
  readonly programId: string;
  readonly programCode: string;
  readonly programName: string;
  readonly studyYear: number | null;
  readonly standardLengthSemesters: number | null;
}

export interface ProgrammeStanding {
  readonly programId: string;
  readonly programCode: string;
  readonly programName: string;
  readonly studyYear: number | null;
  readonly standardLengthSemesters: number | null;
  /**
   * What the whole programme is worth, or null when its length is unrecorded
   * — in which case there is no denominator and the screen must not invent
   * one.
   */
  readonly creditsRequired: number | null;
  readonly creditsEarned: number;
  /** Null for the same reason `creditsRequired` is. Capped at 100. */
  readonly percentComplete: number | null;
  /** Never negative: a student past the requirement is finished, not owed -5. */
  readonly creditsRemaining: number | null;
  /** Whether the credits are there. Says nothing about a final examination. */
  readonly creditsComplete: boolean;
}

/**
 * Turns a pile of totals into a position: how far through the programme the
 * student is, not merely how many credits they have collected.
 *
 * This is the whole of U2. A grade list answers "what did I get"; a student
 * wants "how much is left", and until a programme is on the other side of the
 * sum there is nothing to divide by.
 */
export function standingIn(
  enrolment: ProgrammeEnrolment,
  progress: Pick<StudyProgress, 'creditsEarned'>,
): ProgrammeStanding {
  const creditsRequired =
    enrolment.standardLengthSemesters === null
      ? null
      : enrolment.standardLengthSemesters * CREDITS_PER_SEMESTER;

  const { creditsEarned } = progress;

  return {
    ...enrolment,
    creditsRequired,
    creditsEarned,
    percentComplete:
      creditsRequired === null || creditsRequired === 0
        ? null
        : Math.min(100, Math.round((creditsEarned / creditsRequired) * 100)),
    creditsRemaining:
      creditsRequired === null ? null : Math.max(0, creditsRequired - creditsEarned),
    creditsComplete: creditsRequired !== null && creditsEarned >= creditsRequired,
  };
}

export const CREDITS_PER_SEMESTER_DEFAULT = CREDITS_PER_SEMESTER;
