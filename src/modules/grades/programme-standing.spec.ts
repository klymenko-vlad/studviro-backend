import { describe, expect, it } from 'vitest';

import { standingIn, type ProgrammeEnrolment } from './programme-standing';

const bachelor: ProgrammeEnrolment = {
  programId: 'program-1',
  programCode: 'INF-BC',
  programName: 'Informatics',
  studyYear: 2,
  standardLengthSemesters: 6,
};

describe('standingIn', () => {
  it('turns credits into a position in the programme', () => {
    const standing = standingIn(bachelor, { creditsEarned: 90 });

    expect(standing).toMatchObject({
      creditsRequired: 180,
      creditsEarned: 90,
      percentComplete: 50,
      creditsRemaining: 90,
      creditsComplete: false,
    });
  });

  it('says a student who has the credits has them', () => {
    const standing = standingIn(bachelor, { creditsEarned: 180 });

    expect(standing).toMatchObject({
      percentComplete: 100,
      creditsRemaining: 0,
      creditsComplete: true,
    });
  });

  it('never owes a negative number of credits, or claims more than complete', () => {
    const standing = standingIn(bachelor, { creditsEarned: 200 });

    expect(standing.creditsRemaining).toBe(0);
    expect(standing.percentComplete).toBe(100);
  });

  it('invents no denominator when the programme has no recorded length', () => {
    const standing = standingIn(
      { ...bachelor, standardLengthSemesters: null },
      { creditsEarned: 90 },
    );

    expect(standing).toMatchObject({
      creditsRequired: null,
      percentComplete: null,
      creditsRemaining: null,
      creditsComplete: false,
    });
    expect(standing.creditsEarned).toBe(90);
  });

  it('does not divide by zero for a programme recorded as zero semesters', () => {
    const standing = standingIn(
      { ...bachelor, standardLengthSemesters: 0 },
      { creditsEarned: 10 },
    );

    expect(standing.percentComplete).toBeNull();
    expect(standing.creditsRequired).toBe(0);
  });

  it('starts a student with nothing at zero rather than at null', () => {
    const standing = standingIn(bachelor, { creditsEarned: 0 });

    expect(standing).toMatchObject({ percentComplete: 0, creditsRemaining: 180 });
  });

  it('rounds to a whole percent rather than showing 49.7', () => {
    expect(standingIn(bachelor, { creditsEarned: 89 }).percentComplete).toBe(49);
  });

  it('carries the programme through so a screen can name it', () => {
    const standing = standingIn(bachelor, { creditsEarned: 0 });

    expect(standing).toMatchObject({
      programCode: 'INF-BC',
      programName: 'Informatics',
      studyYear: 2,
    });
  });
});
