import { describe, expect, it } from 'vitest';

import { quizGradeOf, scaledPoints } from './quiz-grade';

describe('scaledPoints', () => {
  it('scales the marks earned to what the quiz is worth', () => {
    expect(scaledPoints(6, 8, 10)).toBe(7.5);
    expect(scaledPoints(1, 3, 10)).toBe(3.3333);
    expect(scaledPoints(8, 8, 10)).toBe(10);
    expect(scaledPoints(0, 8, 10)).toBe(0);
  });

  it('gives nothing when nothing could be earned', () => {
    expect(scaledPoints(0, 0, 10)).toBe(0);
  });
});

describe('quizGradeOf', () => {
  const attempts = [
    { attempt: 1, points: 6 },
    { attempt: 2, points: 9 },
    { attempt: 3, points: 7 },
  ];

  it('takes the highest, the last or the average of the finished, marked attempts', () => {
    expect(quizGradeOf('highest', attempts)).toBe(9);
    expect(quizGradeOf('last', attempts)).toBe(7);
    expect(quizGradeOf('average', attempts)).toBe(7.3333);
  });

  it('leaves out attempts that still need marking', () => {
    const pending = [...attempts, { attempt: 4, points: null }];

    expect(quizGradeOf('last', pending)).toBe(7);
    expect(quizGradeOf('average', pending)).toBe(7.3333);
  });

  it('has no grade with no marked attempt', () => {
    expect(quizGradeOf('highest', [])).toBeNull();
    expect(quizGradeOf('average', [{ attempt: 1, points: null }])).toBeNull();
  });
});
