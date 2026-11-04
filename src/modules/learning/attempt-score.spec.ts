import { describe, expect, it } from 'vitest';

import { attemptScoreOf } from './attempt-score';

describe('attemptScoreOf', () => {
  it('sums the marks, scales them and waits while one is missing', () => {
    expect(attemptScoreOf([1, 2], 4, 10)).toEqual({
      rawMarks: 3,
      points: 7.5,
      needsMarking: false,
    });
    expect(attemptScoreOf([1, null], 4, 10)).toEqual({
      rawMarks: 1,
      points: 2.5,
      needsMarking: true,
    });
    expect(attemptScoreOf([1], 4, null).points).toBeNull();
  });
});
