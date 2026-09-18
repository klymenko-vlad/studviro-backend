import { describe, expect, it } from 'vitest';

import { attemptsRequiredFor, laddersTo } from './exam-attempt-ladder';

describe('the exam attempt ladder', () => {
  it('asks nothing of a regular term', () => {
    expect(attemptsRequiredFor('regular')).toBe(0);
    expect(laddersTo('regular', 0)).toBe(true);
  });

  it('asks nothing of a state exam, which is not a resit of anything', () => {
    expect(laddersTo('state_exam', 0)).toBe(true);
  });

  it('closes a first retake to a student who has not failed yet', () => {
    expect(laddersTo('first_retake', 0)).toBe(false);
    expect(laddersTo('first_retake', 1)).toBe(true);
  });

  it('closes a second retake until two attempts are spent', () => {
    expect(laddersTo('second_retake', 1)).toBe(false);
    expect(laddersTo('second_retake', 2)).toBe(true);
  });

  it('lets a student further up the ladder still sit an earlier term', () => {
    expect(laddersTo('first_retake', 3)).toBe(true);
  });
});
