import { describe, expect, it } from 'vitest';

import { InvalidInputError } from '../../common/errors/domain.error';

import {
  assertCompletionRule,
  completedAtOf,
  completionStateOf,
  isCompleteState,
  type CompletionFacts,
} from './completion-rule';

const AT = new Date('2026-11-02T09:00:00.000Z');

const facts = (overrides: Partial<CompletionFacts> = {}): CompletionFacts => ({
  viewedAt: null,
  markedDoneAt: null,
  submittedAt: null,
  markedAt: null,
  points: null,
  ...overrides,
});

describe('assertCompletionRule', () => {
  it('accepts every rule that fits a material', () => {
    for (const rule of ['none', 'manual', 'viewed'] as const) {
      expect(() => {
        assertCompletionRule({ kind: 'material', rule });
      }).not.toThrow();
    }
  });

  it('refuses a rule a material cannot meet', () => {
    for (const rule of ['submitted', 'marked', 'passed'] as const) {
      expect(() => {
        assertCompletionRule({ kind: 'material', rule });
      }).toThrow(
        expect.objectContaining({
          code: 'COMPLETION_RULE_NOT_APPLICABLE',
        }) as InvalidInputError,
      );
    }
  });

  it('refuses viewing as the rule for an assignment', () => {
    expect(() => {
      assertCompletionRule({ kind: 'assignment', rule: 'viewed' });
    }).toThrow(InvalidInputError);
  });

  it('accepts submitted and marked on an assignment with no pass mark', () => {
    for (const rule of ['none', 'manual', 'submitted', 'marked'] as const) {
      expect(() => {
        assertCompletionRule({ kind: 'assignment', rule, passPoints: null, maxPoints: 20 });
      }).not.toThrow();
    }
  });

  it('asks for a pass mark when the rule is to pass', () => {
    expect(() => {
      assertCompletionRule({ kind: 'assignment', rule: 'passed', passPoints: null });
    }).toThrow(
      expect.objectContaining({ code: 'COMPLETION_PASS_MARK_REQUIRED' }) as InvalidInputError,
    );
  });

  it('takes a pass mark up to and including what the assignment is worth', () => {
    expect(() => {
      assertCompletionRule({
        kind: 'assignment',
        rule: 'passed',
        passPoints: 20,
        maxPoints: 20,
      });
    }).not.toThrow();
    expect(() => {
      assertCompletionRule({
        kind: 'assignment',
        rule: 'passed',
        passPoints: 0,
        maxPoints: 20,
      });
    }).not.toThrow();
    expect(() => {
      assertCompletionRule({
        kind: 'assignment',
        rule: 'passed',
        passPoints: 7,
        maxPoints: null,
      });
    }).not.toThrow();
  });

  it('refuses a pass mark above what the assignment is worth', () => {
    expect(() => {
      assertCompletionRule({
        kind: 'assignment',
        rule: 'passed',
        passPoints: 20.5,
        maxPoints: 20,
      });
    }).toThrow(
      expect.objectContaining({ code: 'COMPLETION_PASS_MARK_ABOVE_MAX' }) as InvalidInputError,
    );
  });
});

describe('completionStateOf', () => {
  it('tracks nothing with no rule, whatever happened', () => {
    expect(
      completionStateOf(
        { rule: 'none', passPoints: null },
        facts({ viewedAt: AT, markedDoneAt: AT, submittedAt: AT, markedAt: AT, points: 9 }),
      ),
    ).toBe('incomplete');
  });

  it('follows the student’s own tick', () => {
    const rule = { rule: 'manual', passPoints: null } as const;
    expect(completionStateOf(rule, facts())).toBe('incomplete');
    expect(completionStateOf(rule, facts({ viewedAt: AT }))).toBe('incomplete');
    expect(completionStateOf(rule, facts({ markedDoneAt: AT }))).toBe('complete');
  });

  it('is complete once the material has been opened', () => {
    const rule = { rule: 'viewed', passPoints: null } as const;
    expect(completionStateOf(rule, facts())).toBe('incomplete');
    expect(completionStateOf(rule, facts({ viewedAt: AT }))).toBe('complete');
  });

  it('is complete once work is handed in, marked or not', () => {
    const rule = { rule: 'submitted', passPoints: null } as const;
    expect(completionStateOf(rule, facts({ markedDoneAt: AT }))).toBe('incomplete');
    expect(completionStateOf(rule, facts({ submittedAt: AT }))).toBe('complete');
  });

  it('is complete once a mark is given, even one without points', () => {
    const rule = { rule: 'marked', passPoints: null } as const;
    expect(completionStateOf(rule, facts({ submittedAt: AT }))).toBe('incomplete');
    expect(completionStateOf(rule, facts({ submittedAt: AT, markedAt: AT }))).toBe('complete');
  });

  it('passes at the pass mark and fails below it', () => {
    const rule = { rule: 'passed', passPoints: 10 } as const;
    expect(completionStateOf(rule, facts({ markedAt: AT, points: 10 }))).toBe('complete_pass');
    expect(completionStateOf(rule, facts({ markedAt: AT, points: 9.99 }))).toBe(
      'complete_fail',
    );
  });

  it('is not yet passed or failed until there are points', () => {
    const rule = { rule: 'passed', passPoints: 10 } as const;
    expect(completionStateOf(rule, facts({ submittedAt: AT }))).toBe('incomplete');
    expect(completionStateOf(rule, facts({ markedAt: AT, points: null }))).toBe('incomplete');
  });
});

describe('isCompleteState', () => {
  it('counts a pass as complete and a fail as not', () => {
    expect(isCompleteState('complete')).toBe(true);
    expect(isCompleteState('complete_pass')).toBe(true);
    expect(isCompleteState('complete_fail')).toBe(false);
    expect(isCompleteState('incomplete')).toBe(false);
    expect(isCompleteState(null)).toBe(false);
  });
});

describe('completedAtOf', () => {
  const EARLIER = new Date('2026-11-01T09:00:00.000Z');

  it('dates a completion by the event that met the rule', () => {
    const all = facts({ viewedAt: EARLIER, markedDoneAt: AT, submittedAt: EARLIER });

    expect(completedAtOf({ rule: 'viewed', passPoints: null }, all)).toEqual(EARLIER);
    expect(completedAtOf({ rule: 'manual', passPoints: null }, all)).toEqual(AT);
    expect(completedAtOf({ rule: 'submitted', passPoints: null }, all)).toEqual(EARLIER);
    expect(
      completedAtOf({ rule: 'passed', passPoints: 5 }, facts({ markedAt: AT, points: 1 })),
    ).toEqual(AT);
  });

  it('has no date while incomplete', () => {
    expect(completedAtOf({ rule: 'viewed', passPoints: null }, facts())).toBeNull();
    expect(
      completedAtOf({ rule: 'none', passPoints: null }, facts({ viewedAt: AT })),
    ).toBeNull();
  });
});
