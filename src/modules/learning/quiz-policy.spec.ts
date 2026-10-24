import { describe, expect, it } from 'vitest';

import { InvalidInputError } from '../../common/errors/domain.error';

import { assertQuizWindow, attemptStateAt, slotTotals, startBlockOf } from './quiz-policy';

const at = (iso: string) => new Date(iso);

describe('assertQuizWindow', () => {
  it('lets a quiz open before it closes, or leave either end open', () => {
    expect(() => {
      assertQuizWindow({ opensAt: at('2026-11-02T08:00Z'), closesAt: at('2026-11-02T09:00Z') });
    }).not.toThrow();
    expect(() => {
      assertQuizWindow({ opensAt: null, closesAt: null });
    }).not.toThrow();
    expect(() => {
      assertQuizWindow({ opensAt: at('2026-11-02T08:00Z') });
    }).not.toThrow();
  });

  it('refuses a quiz that closes before or as it opens', () => {
    for (const closesAt of [at('2026-11-02T08:00Z'), at('2026-11-02T07:59Z')]) {
      expect(() => {
        assertQuizWindow({ opensAt: at('2026-11-02T08:00Z'), closesAt });
      }).toThrow(InvalidInputError);
    }
  });
});

describe('attemptStateAt', () => {
  const window = { opensAt: at('2026-11-02T08:00Z'), closesAt: at('2026-11-02T09:00Z') };

  it('is upcoming before it opens, open from the opening, closed from the close', () => {
    expect(attemptStateAt(window, at('2026-11-02T07:59:59Z'))).toBe('upcoming');
    expect(attemptStateAt(window, at('2026-11-02T08:00Z'))).toBe('open');
    expect(attemptStateAt(window, at('2026-11-02T08:59:59Z'))).toBe('open');
    expect(attemptStateAt(window, at('2026-11-02T09:00Z'))).toBe('closed');
  });

  it('is open with no dates at all', () => {
    expect(attemptStateAt({ opensAt: null, closesAt: null }, at('2030-01-01T00:00Z'))).toBe(
      'open',
    );
  });
});

describe('slotTotals', () => {
  it('counts a random slot once per question it draws', () => {
    expect(
      slotTotals([
        { kind: 'question', pickCount: null, mark: '2.0000' },
        { kind: 'random', pickCount: 3, mark: '1.5000' },
      ]),
    ).toEqual({ questionCount: 4, totalMarks: 6.5 });
  });

  it('is nothing for an empty quiz', () => {
    expect(slotTotals([])).toEqual({ questionCount: 0, totalMarks: 0 });
  });
});

describe('startBlockOf', () => {
  const open = { opensAt: at('2026-11-02T08:00Z'), closesAt: at('2026-11-02T10:00Z') };
  const now = at('2026-11-02T09:00Z');
  const ready = { window: open, maxAttempts: 2, used: 1, questionCount: 3 };

  it('lets a student start while the quiz is open, with attempts and questions left', () => {
    expect(startBlockOf(ready, now)).toBeNull();
    expect(startBlockOf({ ...ready, maxAttempts: null, used: 40 }, now)).toBeNull();
  });

  it('says why a student cannot start', () => {
    expect(startBlockOf(ready, at('2026-11-02T07:59Z'))).toBe('upcoming');
    expect(startBlockOf(ready, at('2026-11-02T10:00Z'))).toBe('closed');
    expect(startBlockOf({ ...ready, used: 2 }, now)).toBe('no_attempts_left');
    expect(startBlockOf({ ...ready, questionCount: 0 }, now)).toBe('no_questions');
  });
});
