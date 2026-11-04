import { describe, expect, it } from 'vitest';

import {
  distinctAnswers,
  presentedOrderOf,
  presentedParts,
  shuffled,
} from './attempt-presentation';

const reversing = (bound: number) => bound - 1;
const keeping = () => 0;

const choiceKey = {
  choices: [
    { text: 'A', correct: true, feedback: 'Right.' },
    { text: 'B', correct: false, feedback: null },
    { text: 'C', correct: false, feedback: null },
  ],
};
const matchingKey = {
  pairs: [
    { prompt: 'Stack', answer: 'LIFO' },
    { prompt: 'Queue', answer: 'FIFO' },
    { prompt: 'Pipe', answer: 'FIFO' },
  ],
};

describe('shuffled', () => {
  it('is a permutation of what it was given and leaves the input alone', () => {
    const input = [0, 1, 2, 3];
    const result = shuffled(input, () => 0);

    expect([...result].sort()).toEqual([0, 1, 2, 3]);
    expect(input).toEqual([0, 1, 2, 3]);
  });

  it('keeps the order when every draw picks the last place', () => {
    expect(shuffled([0, 1, 2], reversing)).toEqual([0, 1, 2]);
  });
});

describe('distinctAnswers', () => {
  it('lists each answer once, in the order first given', () => {
    expect(distinctAnswers(matchingKey)).toEqual(['LIFO', 'FIFO']);
  });
});

describe('presentedOrderOf', () => {
  it('keeps the choices in order when choices are not shuffled', () => {
    expect(presentedOrderOf('single_choice', choiceKey, false, keeping)).toEqual({
      choices: [0, 1, 2],
    });
  });

  it('shuffles the choices once, when asked', () => {
    expect(presentedOrderOf('multiple_choice', choiceKey, true, keeping)).toEqual({
      choices: [1, 2, 0],
    });
  });

  it('always shuffles the answers of a matching question, and its prompts when asked', () => {
    expect(presentedOrderOf('matching', matchingKey, false, keeping)).toEqual({
      prompts: [0, 1, 2],
      answers: [1, 0],
    });
    expect(presentedOrderOf('matching', matchingKey, true, keeping)).toEqual({
      prompts: [1, 2, 0],
      answers: [1, 0],
    });
  });

  it('has no order for the other types', () => {
    expect(
      presentedOrderOf(
        'true_false',
        { correct: true, trueFeedback: null, falseFeedback: null },
        true,
        keeping,
      ),
    ).toBeNull();
    expect(presentedOrderOf('essay', {}, true, keeping)).toBeNull();
  });
});

describe('presentedParts', () => {
  it('gives the choices in the stored order, with their texts and nothing else', () => {
    const parts = presentedParts('single_choice', choiceKey, { choices: [2, 0, 1] });

    expect(parts).toEqual({
      choices: [
        { id: 2, text: 'C' },
        { id: 0, text: 'A' },
        { id: 1, text: 'B' },
      ],
      prompts: [],
      answers: [],
    });
    expect(JSON.stringify(parts)).not.toMatch(/correct|Right/u);
  });

  it('gives a matching question its prompts and its distinct answers', () => {
    expect(
      presentedParts('matching', matchingKey, { prompts: [2, 0, 1], answers: [1, 0] }),
    ).toEqual({
      choices: [],
      prompts: [
        { id: 2, text: 'Pipe' },
        { id: 0, text: 'Stack' },
        { id: 1, text: 'Queue' },
      ],
      answers: [
        { id: 1, text: 'FIFO' },
        { id: 0, text: 'LIFO' },
      ],
    });
  });

  it('gives nothing to choose from for the other types', () => {
    expect(presentedParts('numerical', { value: 1, tolerance: 0 }, null)).toEqual({
      choices: [],
      prompts: [],
      answers: [],
    });
  });
});
