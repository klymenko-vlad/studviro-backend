import { describe, expect, it } from 'vitest';

import { InvalidInputError } from '../../common/errors/domain.error';

import { answerKeyOf, type AnswerKeyInput } from './question-answer-key';

const codeOf = (run: () => unknown): string | null => {
  try {
    run();

    return null;
  } catch (error) {
    if (error instanceof InvalidInputError) return error.code;
    throw error;
  }
};

const choice = (text: string, correct = false, feedback?: string) => ({
  text,
  correct,
  ...(feedback === undefined ? {} : { feedback }),
});

describe('answerKeyOf', () => {
  describe('single choice', () => {
    it('keeps the choices in order, with feedback per choice', () => {
      expect(
        answerKeyOf('single_choice', {
          choices: [choice(' O(n log n) ', true, 'Right.'), choice('O(n²)')],
        }),
      ).toEqual({
        choices: [
          { text: 'O(n log n)', correct: true, feedback: 'Right.' },
          { text: 'O(n²)', correct: false, feedback: null },
        ],
      });
    });

    it('needs exactly one correct choice', () => {
      expect(
        codeOf(() =>
          answerKeyOf('single_choice', { choices: [choice('a', true), choice('b', true)] }),
        ),
      ).toBe('QUESTION_CORRECT_CHOICES');
      expect(
        codeOf(() => answerKeyOf('single_choice', { choices: [choice('a'), choice('b')] })),
      ).toBe('QUESTION_CORRECT_CHOICES');
    });

    it('needs at least two choices and at most twenty', () => {
      expect(codeOf(() => answerKeyOf('single_choice', { choices: [choice('a', true)] }))).toBe(
        'QUESTION_CHOICES_INVALID',
      );
      expect(codeOf(() => answerKeyOf('single_choice', {}))).toBe('QUESTION_CHOICES_INVALID');

      const many = Array.from({ length: 21 }, (_, index) => choice(`c${index}`, index === 0));
      expect(codeOf(() => answerKeyOf('single_choice', { choices: many }))).toBe(
        'QUESTION_CHOICES_INVALID',
      );
      expect(() => answerKeyOf('single_choice', { choices: many.slice(0, 20) })).not.toThrow();
    });

    it('refuses an empty or repeated choice', () => {
      expect(
        codeOf(() =>
          answerKeyOf('single_choice', { choices: [choice('a', true), choice('   ')] }),
        ),
      ).toBe('QUESTION_CHOICES_INVALID');
      expect(
        codeOf(() =>
          answerKeyOf('single_choice', { choices: [choice('a', true), choice(' a ')] }),
        ),
      ).toBe('QUESTION_CHOICES_INVALID');
    });
  });

  describe('multiple choice', () => {
    it('accepts several correct choices', () => {
      const key = answerKeyOf('multiple_choice', {
        choices: [choice('a', true), choice('b', true), choice('c')],
      });

      expect(key).toEqual({
        choices: [
          { text: 'a', correct: true, feedback: null },
          { text: 'b', correct: true, feedback: null },
          { text: 'c', correct: false, feedback: null },
        ],
      });
    });

    it('needs at least one correct choice', () => {
      expect(
        codeOf(() => answerKeyOf('multiple_choice', { choices: [choice('a'), choice('b')] })),
      ).toBe('QUESTION_CORRECT_CHOICES');
    });
  });

  describe('true or false', () => {
    it('keeps the right answer and the feedback for each', () => {
      expect(answerKeyOf('true_false', { correct: false, trueFeedback: 'No.' })).toEqual({
        correct: false,
        trueFeedback: 'No.',
        falseFeedback: null,
      });
    });

    it('needs the right answer', () => {
      expect(codeOf(() => answerKeyOf('true_false', {}))).toBe('QUESTION_TRUE_FALSE_INVALID');
    });
  });

  describe('short answer', () => {
    it('keeps the accepted answers, trimmed, and whether case matters', () => {
      expect(
        answerKeyOf('short_answer', { acceptedAnswers: [' Dijkstra ', 'dijkstra’s'] }),
      ).toEqual({ acceptedAnswers: ['Dijkstra', 'dijkstra’s'], caseSensitive: false });
      expect(
        answerKeyOf('short_answer', { acceptedAnswers: ['Ab'], caseSensitive: true }),
      ).toEqual({ acceptedAnswers: ['Ab'], caseSensitive: true });
    });

    it('needs one to twenty answers, none empty', () => {
      expect(codeOf(() => answerKeyOf('short_answer', { acceptedAnswers: [] }))).toBe(
        'QUESTION_ACCEPTED_ANSWERS_INVALID',
      );
      expect(codeOf(() => answerKeyOf('short_answer', { acceptedAnswers: ['a', ' '] }))).toBe(
        'QUESTION_ACCEPTED_ANSWERS_INVALID',
      );
      expect(
        codeOf(() =>
          answerKeyOf('short_answer', {
            acceptedAnswers: Array.from({ length: 21 }, (_, index) => `a${index}`),
          }),
        ),
      ).toBe('QUESTION_ACCEPTED_ANSWERS_INVALID');
    });

    it('refuses the same answer twice, by the case rule', () => {
      expect(
        codeOf(() => answerKeyOf('short_answer', { acceptedAnswers: ['Heap', 'heap'] })),
      ).toBe('QUESTION_ACCEPTED_ANSWERS_INVALID');
      expect(() =>
        answerKeyOf('short_answer', { acceptedAnswers: ['Heap', 'heap'], caseSensitive: true }),
      ).not.toThrow();
    });
  });

  describe('numerical', () => {
    it('keeps the answer and a tolerance, zero by default', () => {
      expect(answerKeyOf('numerical', { value: 3.14, tolerance: 0.01 })).toEqual({
        value: 3.14,
        tolerance: 0.01,
      });
      expect(answerKeyOf('numerical', { value: -2 })).toEqual({ value: -2, tolerance: 0 });
    });

    it('needs a finite answer and a tolerance that is not negative', () => {
      expect(codeOf(() => answerKeyOf('numerical', {}))).toBe('QUESTION_NUMERICAL_INVALID');
      expect(codeOf(() => answerKeyOf('numerical', { value: Number.NaN }))).toBe(
        'QUESTION_NUMERICAL_INVALID',
      );
      expect(codeOf(() => answerKeyOf('numerical', { value: 1, tolerance: -0.1 }))).toBe(
        'QUESTION_NUMERICAL_INVALID',
      );
    });
  });

  describe('matching', () => {
    it('keeps the pairs, trimmed', () => {
      expect(
        answerKeyOf('matching', {
          pairs: [
            { prompt: ' Stack ', answer: 'LIFO' },
            { prompt: 'Queue', answer: 'FIFO' },
          ],
        }),
      ).toEqual({
        pairs: [
          { prompt: 'Stack', answer: 'LIFO' },
          { prompt: 'Queue', answer: 'FIFO' },
        ],
      });
    });

    it('needs at least two pairs, each complete, with distinct prompts', () => {
      expect(
        codeOf(() => answerKeyOf('matching', { pairs: [{ prompt: 'a', answer: 'b' }] })),
      ).toBe('QUESTION_PAIRS_INVALID');
      expect(
        codeOf(() =>
          answerKeyOf('matching', {
            pairs: [
              { prompt: 'a', answer: 'b' },
              { prompt: 'c', answer: ' ' },
            ],
          }),
        ),
      ).toBe('QUESTION_PAIRS_INVALID');
      expect(
        codeOf(() =>
          answerKeyOf('matching', {
            pairs: [
              { prompt: 'a', answer: 'b' },
              { prompt: 'a', answer: 'c' },
            ],
          }),
        ),
      ).toBe('QUESTION_PAIRS_INVALID');
    });
  });

  describe('essay', () => {
    it('has no answer key', () => {
      expect(answerKeyOf('essay', {})).toEqual({});
    });
  });

  it('refuses what belongs to another type', () => {
    const cases: [Parameters<typeof answerKeyOf>[0], AnswerKeyInput][] = [
      ['essay', { choices: [choice('a', true), choice('b')] }],
      ['numerical', { value: 1, acceptedAnswers: ['1'] }],
      ['true_false', { correct: true, pairs: [] }],
      ['single_choice', { choices: [choice('a', true), choice('b')], value: 2 }],
    ];

    for (const [type, input] of cases) {
      expect(codeOf(() => answerKeyOf(type, input))).toBe('QUESTION_FIELD_NOT_APPLICABLE');
    }
  });
});
