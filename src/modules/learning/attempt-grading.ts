import type {
  AttemptResponse,
  ChoiceAnswerKey,
  MatchingAnswerKey,
  NumericalAnswerKey,
  QuestionAnswerKey,
  QuestionType,
  ShortAnswerKey,
  TrueFalseAnswerKey,
} from '../../database/schema';

import { distinctAnswers } from './attempt-presentation';

const PRECISION = 10_000;
const NUMERICAL_EPSILON = 1e-9;
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu;

export function autoMarkOf(
  type: QuestionType,
  key: QuestionAnswerKey,
  response: AttemptResponse | null,
  mark: number,
): number | null {
  if (type === 'essay') return null;
  if (response === null) return 0;

  return rounded(mark * fractionOf(type, key, response));
}

export function rounded(value: number): number {
  return Math.round(value * PRECISION) / PRECISION;
}

export function parseNumber(text: string): number | null {
  const normalised = text.trim().replace(',', '.');
  if (!NUMBER.test(normalised)) return null;

  const value = Number(normalised);

  return Number.isFinite(value) ? value : null;
}

function fractionOf(type: QuestionType, key: QuestionAnswerKey, response: AttemptResponse) {
  switch (type) {
    case 'single_choice':
      return 'choice' in response ? singleChoice(key as ChoiceAnswerKey, response.choice) : 0;
    case 'multiple_choice':
      return 'choices' in response
        ? multipleChoice(key as ChoiceAnswerKey, response.choices)
        : 0;
    case 'true_false':
      return 'value' in response && response.value === (key as TrueFalseAnswerKey).correct
        ? 1
        : 0;
    case 'short_answer':
      return 'text' in response ? shortAnswer(key as ShortAnswerKey, response.text) : 0;
    case 'numerical':
      return 'text' in response ? numerical(key as NumericalAnswerKey, response.text) : 0;
    case 'matching':
      return 'pairs' in response ? matching(key as MatchingAnswerKey, response.pairs) : 0;
    case 'essay':
      return 0;
  }
}

function singleChoice(key: ChoiceAnswerKey, choice: number): number {
  return key.choices[choice]?.correct === true ? 1 : 0;
}

function multipleChoice(key: ChoiceAnswerKey, picked: readonly number[]): number {
  const correct = key.choices.filter((choice) => choice.correct).length;
  const wrong = key.choices.length - correct;
  const earned = [...new Set(picked)].reduce((sum, index) => {
    const choice = key.choices[index];
    if (!choice) return sum;

    return sum + (choice.correct ? 1 / correct : -1 / wrong);
  }, 0);

  return Math.max(0, earned);
}

function shortAnswer(key: ShortAnswerKey, text: string): number {
  const given = comparable(text.trim(), key.caseSensitive);
  if (given === '') return 0;

  return key.acceptedAnswers.some((answer) => comparable(answer, key.caseSensitive) === given)
    ? 1
    : 0;
}

function comparable(text: string, caseSensitive: boolean): string {
  return caseSensitive ? text : text.toLocaleLowerCase();
}

function numerical(key: NumericalAnswerKey, text: string): number {
  const value = parseNumber(text);
  if (value === null) return 0;

  return Math.abs(value - key.value) <= key.tolerance + NUMERICAL_EPSILON ? 1 : 0;
}

function matching(
  key: MatchingAnswerKey,
  pairs: readonly { prompt: number; answer: number }[],
): number {
  const answers = distinctAnswers(key);
  const right = pairs.filter(
    (pair) =>
      key.pairs[pair.prompt] !== undefined &&
      answers[pair.answer] === key.pairs[pair.prompt]?.answer,
  ).length;

  return right / key.pairs.length;
}
