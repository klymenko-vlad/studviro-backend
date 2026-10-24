import { describe, expect, it } from 'vitest';

import { InvalidInputError } from '../../common/errors/domain.error';

import { MAX_ESSAY_LENGTH, MAX_SHORT_TEXT, responseOf } from './attempt-response';

const codeOf = (run: () => unknown): string | null => {
  try {
    run();

    return null;
  } catch (error) {
    if (error instanceof InvalidInputError) return error.code;
    throw error;
  }
};

const choiceOrder = { choices: [2, 0, 1] };
const matchingOrder = { prompts: [1, 0], answers: [0, 1] };

describe('responseOf', () => {
  it('reads a single choice among those shown', () => {
    expect(responseOf('single_choice', choiceOrder, { choice: 2 })).toEqual({ choice: 2 });
    expect(codeOf(() => responseOf('single_choice', choiceOrder, { choice: 3 }))).toBe(
      'QUIZ_ANSWER_INVALID',
    );
  });

  it('reads several choices once each, and none as no answer', () => {
    expect(responseOf('multiple_choice', choiceOrder, { choices: [1, 0, 1] })).toEqual({
      choices: [0, 1],
    });
    expect(responseOf('multiple_choice', choiceOrder, { choices: [] })).toBeNull();
    expect(codeOf(() => responseOf('multiple_choice', choiceOrder, { choices: [5] }))).toBe(
      'QUIZ_ANSWER_INVALID',
    );
  });

  it('reads true or false', () => {
    expect(responseOf('true_false', null, { value: false })).toEqual({ value: false });
  });

  it('keeps text as given, and blank text as no answer', () => {
    expect(responseOf('short_answer', null, { text: ' BFS ' })).toEqual({ text: ' BFS ' });
    expect(responseOf('numerical', null, { text: '3,14' })).toEqual({ text: '3,14' });
    expect(responseOf('essay', null, { text: '   ' })).toBeNull();
  });

  it('limits the length of text, essays more generously', () => {
    expect(
      codeOf(() => responseOf('short_answer', null, { text: 'x'.repeat(MAX_SHORT_TEXT + 1) })),
    ).toBe('QUIZ_ANSWER_INVALID');
    expect(responseOf('essay', null, { text: 'x'.repeat(MAX_ESSAY_LENGTH) })).not.toBeNull();
    expect(
      codeOf(() => responseOf('essay', null, { text: 'x'.repeat(MAX_ESSAY_LENGTH + 1) })),
    ).toBe('QUIZ_ANSWER_INVALID');
  });

  it('reads matched pairs among the prompts and answers shown, one answer per prompt', () => {
    expect(
      responseOf('matching', matchingOrder, {
        pairs: [
          { prompt: 1, answer: 0 },
          { prompt: 0, answer: 0 },
        ],
      }),
    ).toEqual({
      pairs: [
        { prompt: 0, answer: 0 },
        { prompt: 1, answer: 0 },
      ],
    });
    expect(responseOf('matching', matchingOrder, { pairs: [] })).toBeNull();
    expect(
      codeOf(() =>
        responseOf('matching', matchingOrder, {
          pairs: [
            { prompt: 0, answer: 0 },
            { prompt: 0, answer: 1 },
          ],
        }),
      ),
    ).toBe('QUIZ_ANSWER_INVALID');
    expect(
      codeOf(() =>
        responseOf('matching', matchingOrder, { pairs: [{ prompt: 0, answer: 7 }] }),
      ),
    ).toBe('QUIZ_ANSWER_INVALID');
  });

  it('takes an empty answer as clearing it', () => {
    expect(responseOf('single_choice', choiceOrder, {})).toBeNull();
    expect(responseOf('true_false', null, { value: null })).toBeNull();
  });

  it('refuses a part of the answer that belongs to another type', () => {
    expect(codeOf(() => responseOf('true_false', null, { text: 'true' }))).toBe(
      'QUIZ_ANSWER_INVALID',
    );
    expect(codeOf(() => responseOf('essay', null, { choice: 0 }))).toBe('QUIZ_ANSWER_INVALID');
  });
});
