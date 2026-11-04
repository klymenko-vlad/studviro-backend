import { describe, expect, it } from 'vitest';

import { distributionOf } from './choice-distribution';

const v1 = {
  choices: [
    { text: 'A', correct: true, feedback: null },
    { text: 'B', correct: false, feedback: null },
  ],
};
const v2 = {
  choices: [
    { text: 'A', correct: true, feedback: null },
    { text: 'B', correct: false, feedback: null },
    { text: 'C', correct: false, feedback: null },
  ],
};

describe('distributionOf', () => {
  it('counts how often each choice was picked, by its text, across versions', () => {
    expect(
      distributionOf('multiple_choice', v2, [
        { key: v1, response: { choices: [0, 1] } },
        { key: v2, response: { choices: [0, 2, 2] } },
        { key: v2, response: null },
      ]),
    ).toEqual({
      options: [
        { text: 'A', value: null, correct: true, count: 2 },
        { text: 'B', value: null, correct: false, count: 1 },
        { text: 'C', value: null, correct: false, count: 1 },
      ],
      unanswered: 1,
    });
  });

  it('keeps a choice an earlier version had and the latest dropped', () => {
    expect(
      distributionOf('single_choice', { choices: [v1.choices[0]!] }, [
        { key: v1, response: { choice: 1 } },
      ])?.options,
    ).toEqual([
      { text: 'A', value: null, correct: true, count: 0 },
      { text: 'B', value: null, correct: false, count: 1 },
    ]);
  });

  it('counts true and false', () => {
    expect(
      distributionOf(
        'true_false',
        { correct: false, trueFeedback: null, falseFeedback: null },
        [
          { key: {}, response: { value: true } },
          { key: {}, response: { value: false } },
          { key: {}, response: { value: false } },
        ],
      ),
    ).toEqual({
      options: [
        { text: null, value: true, correct: false, count: 1 },
        { text: null, value: false, correct: true, count: 2 },
      ],
      unanswered: 0,
    });
  });

  it('has none for a question without options', () => {
    expect(distributionOf('essay', {}, [])).toBeNull();
  });
});
