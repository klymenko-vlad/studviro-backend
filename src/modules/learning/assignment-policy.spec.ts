import { describe, expect, it } from 'vitest';

import { ConflictError, InvalidInputError } from '../../common/errors/domain.error';

import {
  assertAttemptPolicy,
  assertSubmittable,
  assertWindow,
  MAX_ATTEMPT_LIMIT,
  type AttemptPolicy,
} from './assignment-policy';

const OPENS = new Date('2026-10-01T08:00:00.000Z');
const DUE = new Date('2026-10-08T22:00:00.000Z');
const CLOSES = new Date('2026-10-15T22:00:00.000Z');

const policy = (overrides: Partial<AttemptPolicy> = {}): AttemptPolicy => ({
  opensAt: OPENS,
  dueAt: DUE,
  closesAt: CLOSES,
  maxAttempts: 1,
  allowsLateSubmission: true,
  ...overrides,
});

const codeOf = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    return error instanceof ConflictError || error instanceof InvalidInputError
      ? error.code
      : 'NOT_A_DOMAIN_ERROR';
  }

  return 'NO_ERROR';
};

describe('assertWindow', () => {
  it('accepts opens before due before closes', () => {
    expect(() => {
      assertWindow({ opensAt: OPENS, dueAt: DUE, closesAt: CLOSES });
    }).not.toThrow();
  });

  it('accepts a window with holes in it', () => {
    expect(() => {
      assertWindow({ dueAt: DUE });
    }).not.toThrow();
    expect(() => {
      assertWindow({});
    }).not.toThrow();
    expect(() => {
      assertWindow({ opensAt: OPENS, closesAt: CLOSES });
    }).not.toThrow();
  });

  it('refuses a due date before the assignment opens', () => {
    expect(
      codeOf(() => {
        assertWindow({ opensAt: DUE, dueAt: OPENS });
      }),
    ).toBe('ASSIGNMENT_WINDOW_INVALID');
  });

  it('refuses a close before the due date', () => {
    expect(
      codeOf(() => {
        assertWindow({ dueAt: CLOSES, closesAt: DUE });
      }),
    ).toBe('ASSIGNMENT_WINDOW_INVALID');
  });

  it('refuses a close before the opening even with no due date', () => {
    expect(
      codeOf(() => {
        assertWindow({ opensAt: CLOSES, closesAt: OPENS });
      }),
    ).toBe('ASSIGNMENT_WINDOW_INVALID');
  });
});

describe('assertAttemptPolicy', () => {
  it('accepts a limit of one, the maximum, or none at all', () => {
    expect(() => {
      assertAttemptPolicy(1);
    }).not.toThrow();
    expect(() => {
      assertAttemptPolicy(MAX_ATTEMPT_LIMIT);
    }).not.toThrow();
    expect(() => {
      assertAttemptPolicy(null);
    }).not.toThrow();
  });

  it('refuses zero, a fraction and a limit past the ceiling', () => {
    for (const value of [0, -1, 1.5, MAX_ATTEMPT_LIMIT + 1]) {
      expect(
        codeOf(() => {
          assertAttemptPolicy(value);
        }),
      ).toBe('ASSIGNMENT_ATTEMPT_LIMIT_INVALID');
    }
  });
});

describe('assertSubmittable', () => {
  it('lets a first attempt through inside the window, and calls it on time', () => {
    expect(assertSubmittable(policy(), 0, new Date('2026-10-02T09:00:00.000Z'))).toEqual({
      isLate: false,
    });
  });

  it('refuses work before the assignment opens', () => {
    expect(
      codeOf(() => assertSubmittable(policy(), 0, new Date('2026-09-30T09:00:00.000Z'))),
    ).toBe('ASSIGNMENT_NOT_OPEN');
  });

  it('marks work after the due date late, when late work is accepted', () => {
    expect(assertSubmittable(policy(), 0, new Date('2026-10-09T09:00:00.000Z'))).toEqual({
      isLate: true,
    });
  });

  it('calls a submission on the due instant on time, not late', () => {
    expect(assertSubmittable(policy(), 0, DUE)).toEqual({ isLate: false });
  });

  it('refuses late work when the assignment does not accept it', () => {
    expect(
      codeOf(() =>
        assertSubmittable(
          policy({ allowsLateSubmission: false }),
          0,
          new Date('2026-10-09T09:00:00.000Z'),
        ),
      ),
    ).toBe('ASSIGNMENT_LATE_NOT_ALLOWED');
  });

  it('refuses work after the assignment closes', () => {
    expect(
      codeOf(() => assertSubmittable(policy(), 0, new Date('2026-10-16T09:00:00.000Z'))),
    ).toBe('ASSIGNMENT_CLOSED');
  });

  it('closes at the due date when nothing else closes it and late work is refused', () => {
    expect(
      codeOf(() =>
        assertSubmittable(
          policy({ closesAt: null, allowsLateSubmission: false }),
          0,
          new Date('2026-10-09T09:00:00.000Z'),
        ),
      ),
    ).toBe('ASSIGNMENT_CLOSED');
  });

  it('stays open indefinitely when late work is accepted and nothing closes it', () => {
    expect(
      assertSubmittable(policy({ closesAt: null }), 0, new Date('2027-10-09T09:00:00.000Z')),
    ).toEqual({ isLate: true });
  });

  it('refuses an attempt past the limit', () => {
    expect(
      codeOf(() => assertSubmittable(policy(), 1, new Date('2026-10-02T09:00:00.000Z'))),
    ).toBe('ASSIGNMENT_ATTEMPTS_EXHAUSTED');
  });

  it('lets a resubmission through while attempts remain', () => {
    expect(
      assertSubmittable(policy({ maxAttempts: 3 }), 2, new Date('2026-10-02T09:00:00.000Z')),
    ).toEqual({ isLate: false });
  });

  it('never exhausts an unlimited policy', () => {
    expect(
      assertSubmittable(
        policy({ maxAttempts: null }),
        99,
        new Date('2026-10-02T09:00:00.000Z'),
      ),
    ).toEqual({ isLate: false });
  });

  it('is on time when there is no due date at all', () => {
    expect(
      assertSubmittable(
        policy({ opensAt: null, dueAt: null, closesAt: null }),
        0,
        new Date('2030-01-01T00:00:00.000Z'),
      ),
    ).toEqual({ isLate: false });
  });
});
