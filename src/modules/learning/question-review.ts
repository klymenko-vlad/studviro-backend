import type {
  AttemptResponse,
  ChoiceAnswerKey,
  MatchedPair,
  MatchingAnswerKey,
  NumericalAnswerKey,
  QuestionAnswerKey,
  QuestionType,
  ShortAnswerKey,
  TrueFalseAnswerKey,
} from '../../database/schema';

import { distinctAnswers } from './attempt-presentation';

export const QUESTION_OUTCOMES = [
  'right',
  'partial',
  'wrong',
  'not_answered',
  'needs_marking',
] as const;
export type QuestionOutcome = (typeof QUESTION_OUTCOMES)[number];

export interface RevealedKey {
  readonly choices: readonly number[] | null;
  readonly value: boolean | null;
  readonly texts: readonly string[] | null;
  readonly number: number | null;
  readonly tolerance: number | null;
  readonly pairs: readonly MatchedPair[] | null;
}

const NOTHING: RevealedKey = {
  choices: null,
  value: null,
  texts: null,
  number: null,
  tolerance: null,
  pairs: null,
};

export function effectiveMarkOf(autoMark: number | null, manualMark: number | null) {
  return manualMark ?? autoMark;
}

export function outcomeOf(
  effective: number | null,
  mark: number,
  response: AttemptResponse | null,
): QuestionOutcome {
  if (effective === null) return 'needs_marking';
  if (effective >= mark) return 'right';
  if (effective > 0) return 'partial';

  return response === null ? 'not_answered' : 'wrong';
}

export function revealedKeyOf(type: QuestionType, key: QuestionAnswerKey): RevealedKey | null {
  switch (type) {
    case 'single_choice':
    case 'multiple_choice':
      return {
        ...NOTHING,
        choices: (key as ChoiceAnswerKey).choices.flatMap((choice, id) =>
          choice.correct ? [id] : [],
        ),
      };
    case 'true_false':
      return { ...NOTHING, value: (key as TrueFalseAnswerKey).correct };
    case 'short_answer':
      return { ...NOTHING, texts: [...(key as ShortAnswerKey).acceptedAnswers] };
    case 'numerical': {
      const numerical = key as NumericalAnswerKey;

      return { ...NOTHING, number: numerical.value, tolerance: numerical.tolerance };
    }
    case 'matching': {
      const matching = key as MatchingAnswerKey;
      const answers = distinctAnswers(matching);

      return {
        ...NOTHING,
        pairs: matching.pairs.map((pair, prompt) => ({
          prompt,
          answer: answers.indexOf(pair.answer),
        })),
      };
    }
    case 'essay':
      return null;
  }
}

export function specificFeedbackOf(
  type: QuestionType,
  key: QuestionAnswerKey,
  response: AttemptResponse | null,
): string[] {
  if (response === null) return [];

  const written = (texts: readonly (string | null | undefined)[]) =>
    texts.filter((text): text is string => typeof text === 'string' && text !== '');
  const choices = (key as ChoiceAnswerKey).choices;

  if (type === 'single_choice' && 'choice' in response) {
    return written([choices[response.choice]?.feedback]);
  }
  if (type === 'multiple_choice' && 'choices' in response) {
    return written(response.choices.map((id) => choices[id]?.feedback));
  }
  if (type === 'true_false' && 'value' in response) {
    const trueFalse = key as TrueFalseAnswerKey;

    return written([response.value ? trueFalse.trueFeedback : trueFalse.falseFeedback]);
  }

  return [];
}
