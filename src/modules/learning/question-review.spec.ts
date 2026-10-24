import { describe, expect, it } from 'vitest';

import {
  effectiveMarkOf,
  outcomeOf,
  revealedKeyOf,
  specificFeedbackOf,
} from './question-review';

const choiceKey = {
  choices: [
    { text: 'A', correct: true, feedback: 'A is right.' },
    { text: 'B', correct: false, feedback: 'B is not.' },
    { text: 'C', correct: true, feedback: null },
  ],
};
const matchingKey = {
  pairs: [
    { prompt: 'Stack', answer: 'LIFO' },
    { prompt: 'Queue', answer: 'FIFO' },
    { prompt: 'Pipe', answer: 'FIFO' },
  ],
};

describe('effectiveMarkOf', () => {
  it('lets a teacher’s mark stand over the automatic one, including a zero', () => {
    expect(effectiveMarkOf(2, null)).toBe(2);
    expect(effectiveMarkOf(2, 1.5)).toBe(1.5);
    expect(effectiveMarkOf(2, 0)).toBe(0);
    expect(effectiveMarkOf(null, null)).toBeNull();
    expect(effectiveMarkOf(null, 3)).toBe(3);
  });
});

describe('outcomeOf', () => {
  it('says right, partly right, wrong, not answered or waiting for a mark', () => {
    expect(outcomeOf(2, 2, { choice: 0 })).toBe('right');
    expect(outcomeOf(1, 2, { choices: [0] })).toBe('partial');
    expect(outcomeOf(0, 2, { choice: 1 })).toBe('wrong');
    expect(outcomeOf(0, 2, null)).toBe('not_answered');
    expect(outcomeOf(null, 4, { text: 'An essay' })).toBe('needs_marking');
  });
});

describe('revealedKeyOf', () => {
  it('names the right choices by the ids the attempt showed', () => {
    expect(revealedKeyOf('multiple_choice', choiceKey)).toMatchObject({ choices: [0, 2] });
    expect(revealedKeyOf('single_choice', choiceKey)).toMatchObject({ choices: [0, 2] });
  });

  it('gives the answer of each type, and nothing for an essay', () => {
    expect(
      revealedKeyOf('true_false', { correct: false, trueFeedback: null, falseFeedback: null }),
    ).toMatchObject({ value: false });
    expect(
      revealedKeyOf('short_answer', { acceptedAnswers: ['BFS'], caseSensitive: false }),
    ).toMatchObject({ texts: ['BFS'] });
    expect(revealedKeyOf('numerical', { value: 11, tolerance: 0.5 })).toMatchObject({
      number: 11,
      tolerance: 0.5,
    });
    expect(revealedKeyOf('essay', {})).toBeNull();
  });

  it('pairs each matching prompt with the id of its distinct answer', () => {
    expect(revealedKeyOf('matching', matchingKey)?.pairs).toEqual([
      { prompt: 0, answer: 0 },
      { prompt: 1, answer: 1 },
      { prompt: 2, answer: 1 },
    ]);
  });
});

describe('specificFeedbackOf', () => {
  it('gives the feedback written for what the student picked, and only that', () => {
    expect(specificFeedbackOf('single_choice', choiceKey, { choice: 1 })).toEqual([
      'B is not.',
    ]);
    expect(specificFeedbackOf('multiple_choice', choiceKey, { choices: [0, 2] })).toEqual([
      'A is right.',
    ]);
    expect(
      specificFeedbackOf(
        'true_false',
        { correct: true, trueFeedback: 'Yes.', falseFeedback: 'No.' },
        { value: false },
      ),
    ).toEqual(['No.']);
  });

  it('gives nothing for no answer or a type without choices', () => {
    expect(specificFeedbackOf('single_choice', choiceKey, null)).toEqual([]);
    expect(
      specificFeedbackOf(
        'short_answer',
        { acceptedAnswers: ['x'], caseSensitive: false },
        {
          text: 'x',
        },
      ),
    ).toEqual([]);
  });
});
