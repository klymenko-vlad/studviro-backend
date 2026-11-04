import { describe, expect, it } from 'vitest';

import { autoMarkOf } from './attempt-grading';

const choices = (...correct: boolean[]) => ({
  choices: correct.map((isCorrect, index) => ({
    text: `Choice ${index}`,
    correct: isCorrect,
    feedback: null,
  })),
});

describe('autoMarkOf', () => {
  describe('single choice', () => {
    const key = choices(false, true, false);

    it('gives the whole mark for the correct choice and nothing for another', () => {
      expect(autoMarkOf('single_choice', key, { choice: 1 }, 2)).toBe(2);
      expect(autoMarkOf('single_choice', key, { choice: 0 }, 2)).toBe(0);
    });

    it('gives nothing for no answer', () => {
      expect(autoMarkOf('single_choice', key, null, 2)).toBe(0);
    });
  });

  describe('multiple choice', () => {
    const key = choices(true, true, false, false, false);

    it('adds mark / ncorrect for each correct choice picked', () => {
      expect(autoMarkOf('multiple_choice', key, { choices: [0, 1] }, 2)).toBe(2);
      expect(autoMarkOf('multiple_choice', key, { choices: [0] }, 2)).toBe(1);
    });

    it('takes mark / nwrong away for each wrong choice picked', () => {
      expect(autoMarkOf('multiple_choice', key, { choices: [0, 1, 2] }, 3)).toBe(2);
      expect(autoMarkOf('multiple_choice', key, { choices: [0, 2] }, 3)).toBe(0.5);
    });

    it('never goes below zero', () => {
      expect(autoMarkOf('multiple_choice', key, { choices: [2, 3, 4] }, 2)).toBe(0);
      expect(autoMarkOf('multiple_choice', key, { choices: [0, 2, 3, 4] }, 2)).toBe(0);
    });

    it('gives nothing for picking every choice, or none', () => {
      expect(autoMarkOf('multiple_choice', key, { choices: [0, 1, 2, 3, 4] }, 2)).toBe(0);
      expect(autoMarkOf('multiple_choice', key, { choices: [] }, 2)).toBe(0);
    });

    it('needs no penalty when every choice is correct', () => {
      expect(autoMarkOf('multiple_choice', choices(true, true), { choices: [1] }, 2)).toBe(1);
    });

    it('rounds to four decimals', () => {
      expect(
        autoMarkOf('multiple_choice', choices(true, true, true, false), { choices: [0] }, 1),
      ).toBe(0.3333);
    });
  });

  describe('true or false', () => {
    const key = { correct: false, trueFeedback: null, falseFeedback: null };

    it('gives the mark when the answer matches', () => {
      expect(autoMarkOf('true_false', key, { value: false }, 1)).toBe(1);
      expect(autoMarkOf('true_false', key, { value: true }, 1)).toBe(0);
    });
  });

  describe('short answer', () => {
    const key = { acceptedAnswers: ['BFS', 'breadth-first search'], caseSensitive: false };

    it('accepts any accepted answer, trimmed, in any case unless the key says otherwise', () => {
      expect(autoMarkOf('short_answer', key, { text: '  bfs ' }, 1)).toBe(1);
      expect(autoMarkOf('short_answer', key, { text: 'Breadth-First Search' }, 1)).toBe(1);
      expect(autoMarkOf('short_answer', key, { text: 'DFS' }, 1)).toBe(0);
    });

    it('compares case when the key is case sensitive', () => {
      const strict = { acceptedAnswers: ['BFS'], caseSensitive: true };

      expect(autoMarkOf('short_answer', strict, { text: 'BFS' }, 1)).toBe(1);
      expect(autoMarkOf('short_answer', strict, { text: 'bfs' }, 1)).toBe(0);
    });

    it('gives nothing for an empty answer', () => {
      expect(autoMarkOf('short_answer', key, { text: '   ' }, 1)).toBe(0);
    });
  });

  describe('numerical', () => {
    const key = { value: 3.14, tolerance: 0.01 };

    it('accepts a number within the tolerance, at both edges', () => {
      expect(autoMarkOf('numerical', key, { text: '3.14' }, 1)).toBe(1);
      expect(autoMarkOf('numerical', key, { text: '3.13' }, 1)).toBe(1);
      expect(autoMarkOf('numerical', key, { text: '3.15' }, 1)).toBe(1);
      expect(autoMarkOf('numerical', key, { text: '3.1501' }, 1)).toBe(0);
    });

    it('reads a decimal comma and surrounding space', () => {
      expect(autoMarkOf('numerical', key, { text: ' 3,14 ' }, 1)).toBe(1);
    });

    it('gives nothing for text that is not a number', () => {
      expect(autoMarkOf('numerical', key, { text: 'pi' }, 1)).toBe(0);
      expect(autoMarkOf('numerical', key, { text: '' }, 1)).toBe(0);
      expect(autoMarkOf('numerical', key, { text: '3.14abc' }, 1)).toBe(0);
    });

    it('needs the exact value when the tolerance is zero', () => {
      const exact = { value: 11, tolerance: 0 };

      expect(autoMarkOf('numerical', exact, { text: '11' }, 1)).toBe(1);
      expect(autoMarkOf('numerical', exact, { text: '11.0001' }, 1)).toBe(0);
    });
  });

  describe('matching', () => {
    const key = {
      pairs: [
        { prompt: 'Stack', answer: 'LIFO' },
        { prompt: 'Queue', answer: 'FIFO' },
        { prompt: 'Deque', answer: 'FIFO' },
      ],
    };

    it('gives each correct pair its share of the mark', () => {
      const all = {
        pairs: [
          { prompt: 0, answer: 0 },
          { prompt: 1, answer: 1 },
          { prompt: 2, answer: 1 },
        ],
      };
      expect(autoMarkOf('matching', key, all, 3)).toBe(3);
      expect(
        autoMarkOf(
          'matching',
          key,
          {
            pairs: [
              { prompt: 0, answer: 1 },
              { prompt: 1, answer: 1 },
            ],
          },
          3,
        ),
      ).toBe(1);
    });

    it('gives nothing for no pair', () => {
      expect(autoMarkOf('matching', key, { pairs: [] }, 3)).toBe(0);
    });
  });

  describe('essay', () => {
    it('is left for a person to mark', () => {
      expect(autoMarkOf('essay', {}, { text: 'An answer.' }, 4)).toBeNull();
      expect(autoMarkOf('essay', {}, null, 4)).toBeNull();
    });
  });

  it('gives nothing for an answer of another shape', () => {
    expect(autoMarkOf('single_choice', choices(true, false), { text: '0' }, 1)).toBe(0);
  });
});
