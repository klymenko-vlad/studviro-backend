import { randomInt } from 'node:crypto';

import type {
  ChoiceAnswerKey,
  MatchingAnswerKey,
  PresentedOrder,
  QuestionAnswerKey,
  QuestionType,
} from '../../database/schema';

export type Random = (bound: number) => number;

export interface PresentedPart {
  readonly id: number;
  readonly text: string;
}

export interface PresentedParts {
  readonly choices: readonly PresentedPart[];
  readonly prompts: readonly PresentedPart[];
  readonly answers: readonly PresentedPart[];
}

export const secureRandom: Random = (bound) => randomInt(bound);

export function shuffled<T>(items: readonly T[], random: Random): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = random(index + 1);
    [result[index], result[swap]] = [result[swap] as T, result[index] as T];
  }

  return result;
}

export function distinctAnswers(key: MatchingAnswerKey): string[] {
  return [...new Set(key.pairs.map((pair) => pair.answer))];
}

export function presentedOrderOf(
  type: QuestionType,
  key: QuestionAnswerKey,
  shuffleChoices: boolean,
  random: Random,
): PresentedOrder | null {
  const indices = (length: number) => Array.from({ length }, (_, index) => index);
  const maybeShuffled = (length: number) =>
    shuffleChoices ? shuffled(indices(length), random) : indices(length);

  switch (type) {
    case 'single_choice':
    case 'multiple_choice':
      return { choices: maybeShuffled((key as ChoiceAnswerKey).choices.length) };
    case 'matching': {
      const matching = key as MatchingAnswerKey;

      return {
        prompts: maybeShuffled(matching.pairs.length),
        answers: shuffled(indices(distinctAnswers(matching).length), random),
      };
    }
    case 'true_false':
    case 'short_answer':
    case 'numerical':
    case 'essay':
      return null;
  }
}

export function presentedParts(
  type: QuestionType,
  key: QuestionAnswerKey,
  order: PresentedOrder | null,
): PresentedParts {
  const pick = (texts: readonly string[], ids: readonly number[] | undefined) =>
    (ids ?? []).flatMap((id) => {
      const text = texts[id];

      return text === undefined ? [] : [{ id, text }];
    });

  if (type === 'single_choice' || type === 'multiple_choice') {
    const choices = (key as ChoiceAnswerKey).choices.map((choice) => choice.text);

    return { choices: pick(choices, order?.choices), prompts: [], answers: [] };
  }

  if (type === 'matching') {
    const matching = key as MatchingAnswerKey;

    return {
      choices: [],
      prompts: pick(
        matching.pairs.map((pair) => pair.prompt),
        order?.prompts,
      ),
      answers: pick(distinctAnswers(matching), order?.answers),
    };
  }

  return { choices: [], prompts: [], answers: [] };
}
