import { InvalidInputError } from '../../common/errors/domain.error';
import type {
  ChoiceAnswerKey,
  MatchingAnswerKey,
  NumericalAnswerKey,
  QuestionAnswerKey,
  QuestionType,
  ShortAnswerKey,
  TrueFalseAnswerKey,
} from '../../database/schema';

export const MIN_CHOICES = 2;
export const MAX_CHOICES = 20;
export const MAX_ACCEPTED_ANSWERS = 20;
export const MIN_PAIRS = 2;
export const MAX_PAIRS = 20;

export interface AnswerKeyInput {
  readonly choices?:
    readonly { text: string; correct: boolean; feedback?: string | null }[] | null;
  readonly correct?: boolean | null;
  readonly trueFeedback?: string | null;
  readonly falseFeedback?: string | null;
  readonly acceptedAnswers?: readonly string[] | null;
  readonly caseSensitive?: boolean | null;
  readonly value?: number | null;
  readonly tolerance?: number | null;
  readonly pairs?: readonly { prompt: string; answer: string }[] | null;
}

type Field = keyof AnswerKeyInput;

const FIELDS_BY_TYPE: Record<QuestionType, readonly Field[]> = {
  single_choice: ['choices'],
  multiple_choice: ['choices'],
  true_false: ['correct', 'trueFeedback', 'falseFeedback'],
  short_answer: ['acceptedAnswers', 'caseSensitive'],
  numerical: ['value', 'tolerance'],
  matching: ['pairs'],
  essay: [],
};

export function answerKeyOf(type: QuestionType, input: AnswerKeyInput): QuestionAnswerKey {
  assertOnlyFieldsOf(type, input);

  switch (type) {
    case 'single_choice':
    case 'multiple_choice':
      return choicesOf(type, input);
    case 'true_false':
      return trueFalseOf(input);
    case 'short_answer':
      return shortAnswerOf(input);
    case 'numerical':
      return numericalOf(input);
    case 'matching':
      return matchingOf(input);
    case 'essay':
      return {};
  }
}

function assertOnlyFieldsOf(type: QuestionType, input: AnswerKeyInput): void {
  const allowed = FIELDS_BY_TYPE[type];
  const foreign = (Object.keys(input) as Field[]).filter(
    (field) => input[field] !== undefined && input[field] !== null && !allowed.includes(field),
  );

  if (foreign.length > 0) {
    throw new InvalidInputError(
      'QUESTION_FIELD_NOT_APPLICABLE',
      'Part of the answer belongs to another type of question',
      { type, fields: foreign },
    );
  }
}

function choicesOf(
  type: 'single_choice' | 'multiple_choice',
  input: AnswerKeyInput,
): ChoiceAnswerKey {
  const choices = (input.choices ?? []).map((choice) => ({
    text: choice.text.trim(),
    correct: choice.correct,
    feedback: optionalText(choice.feedback),
  }));
  const texts = choices.map((choice) => choice.text);

  if (
    choices.length < MIN_CHOICES ||
    choices.length > MAX_CHOICES ||
    texts.some((text) => text === '') ||
    new Set(texts).size !== texts.length
  ) {
    throw new InvalidInputError(
      'QUESTION_CHOICES_INVALID',
      `Give between ${MIN_CHOICES} and ${MAX_CHOICES} different choices, none of them empty`,
      { count: choices.length },
    );
  }

  const correct = choices.filter((choice) => choice.correct).length;
  if (type === 'single_choice' ? correct !== 1 : correct < 1) {
    throw new InvalidInputError(
      'QUESTION_CORRECT_CHOICES',
      type === 'single_choice'
        ? 'Exactly one choice must be correct'
        : 'At least one choice must be correct',
      { correct },
    );
  }

  return { choices };
}

function trueFalseOf(input: AnswerKeyInput): TrueFalseAnswerKey {
  if (typeof input.correct !== 'boolean') {
    throw new InvalidInputError(
      'QUESTION_TRUE_FALSE_INVALID',
      'Say whether the statement is true or false',
    );
  }

  return {
    correct: input.correct,
    trueFeedback: optionalText(input.trueFeedback),
    falseFeedback: optionalText(input.falseFeedback),
  };
}

function shortAnswerOf(input: AnswerKeyInput): ShortAnswerKey {
  const caseSensitive = input.caseSensitive ?? false;
  const acceptedAnswers = (input.acceptedAnswers ?? []).map((answer) => answer.trim());
  const compared = acceptedAnswers.map((answer) =>
    caseSensitive ? answer : answer.toLocaleLowerCase(),
  );

  if (
    acceptedAnswers.length === 0 ||
    acceptedAnswers.length > MAX_ACCEPTED_ANSWERS ||
    acceptedAnswers.some((answer) => answer === '') ||
    new Set(compared).size !== compared.length
  ) {
    throw new InvalidInputError(
      'QUESTION_ACCEPTED_ANSWERS_INVALID',
      `Give between 1 and ${MAX_ACCEPTED_ANSWERS} different accepted answers, none of them empty`,
      { count: acceptedAnswers.length },
    );
  }

  return { acceptedAnswers, caseSensitive };
}

function numericalOf(input: AnswerKeyInput): NumericalAnswerKey {
  const value = input.value;
  const tolerance = input.tolerance ?? 0;

  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    !Number.isFinite(tolerance) ||
    tolerance < 0
  ) {
    throw new InvalidInputError(
      'QUESTION_NUMERICAL_INVALID',
      'Give the answer as a number, and a tolerance of zero or more',
    );
  }

  return { value, tolerance };
}

function matchingOf(input: AnswerKeyInput): MatchingAnswerKey {
  const pairs = (input.pairs ?? []).map((pair) => ({
    prompt: pair.prompt.trim(),
    answer: pair.answer.trim(),
  }));
  const prompts = pairs.map((pair) => pair.prompt);

  if (
    pairs.length < MIN_PAIRS ||
    pairs.length > MAX_PAIRS ||
    pairs.some((pair) => pair.prompt === '' || pair.answer === '') ||
    new Set(prompts).size !== prompts.length
  ) {
    throw new InvalidInputError(
      'QUESTION_PAIRS_INVALID',
      `Give between ${MIN_PAIRS} and ${MAX_PAIRS} complete pairs, each with a different prompt`,
      { count: pairs.length },
    );
  }

  return { pairs };
}

function optionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  return trimmed;
}
