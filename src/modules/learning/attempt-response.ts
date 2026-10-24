import { InvalidInputError } from '../../common/errors/domain.error';
import type {
  AttemptResponse,
  MatchedPair,
  PresentedOrder,
  QuestionType,
} from '../../database/schema';

export const MAX_SHORT_TEXT = 500;
export const MAX_ESSAY_LENGTH = 50_000;

export interface AnswerInput {
  readonly choice?: number | null;
  readonly choices?: readonly number[] | null;
  readonly value?: boolean | null;
  readonly text?: string | null;
  readonly pairs?: readonly MatchedPair[] | null;
}

type Field = keyof AnswerInput;

const FIELD_OF: Record<QuestionType, Field> = {
  single_choice: 'choice',
  multiple_choice: 'choices',
  true_false: 'value',
  short_answer: 'text',
  numerical: 'text',
  essay: 'text',
  matching: 'pairs',
};

export function responseOf(
  type: QuestionType,
  order: PresentedOrder | null,
  input: AnswerInput,
): AttemptResponse | null {
  const field = FIELD_OF[type];
  const foreign = (Object.keys(input) as Field[]).filter(
    (name) => name !== field && input[name] !== undefined && input[name] !== null,
  );
  if (foreign.length > 0) throw invalid('That is not an answer to this question', { foreign });

  switch (type) {
    case 'single_choice':
      return single(order, input.choice);
    case 'multiple_choice':
      return several(order, input.choices);
    case 'true_false':
      return typeof input.value === 'boolean' ? { value: input.value } : null;
    case 'short_answer':
    case 'numerical':
      return text(input.text, MAX_SHORT_TEXT);
    case 'essay':
      return text(input.text, MAX_ESSAY_LENGTH);
    case 'matching':
      return matched(order, input.pairs);
  }
}

function single(order: PresentedOrder | null, choice: number | null | undefined) {
  if (choice === null || choice === undefined) return null;
  if (!(order?.choices ?? []).includes(choice)) throw invalid('Pick one of the choices shown');

  return { choice };
}

function several(order: PresentedOrder | null, choices: readonly number[] | null | undefined) {
  if (!choices || choices.length === 0) return null;

  const shown = order?.choices ?? [];
  if (choices.some((choice) => !shown.includes(choice))) {
    throw invalid('Pick among the choices shown');
  }

  return { choices: [...new Set(choices)].sort((a, b) => a - b) };
}

function text(given: string | null | undefined, limit: number) {
  if (given === null || given === undefined || given.trim() === '') return null;
  if (given.length > limit) throw invalid(`An answer here is at most ${limit} characters`);

  return { text: given };
}

function matched(
  order: PresentedOrder | null,
  pairs: readonly MatchedPair[] | null | undefined,
) {
  if (!pairs || pairs.length === 0) return null;

  const prompts = order?.prompts ?? [];
  const answers = order?.answers ?? [];
  const unknown = pairs.some(
    (pair) => !prompts.includes(pair.prompt) || !answers.includes(pair.answer),
  );
  const repeated = new Set(pairs.map((pair) => pair.prompt)).size !== pairs.length;
  if (unknown || repeated) throw invalid('Match each prompt shown to one answer shown');

  return {
    pairs: [...pairs]
      .map((pair) => ({ prompt: pair.prompt, answer: pair.answer }))
      .sort((a, b) => a.prompt - b.prompt),
  };
}

function invalid(message: string, details?: Record<string, unknown>): InvalidInputError {
  return new InvalidInputError('QUIZ_ANSWER_INVALID', message, details);
}
