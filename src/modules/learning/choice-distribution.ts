import type {
  AttemptResponse,
  ChoiceAnswerKey,
  QuestionAnswerKey,
  QuestionType,
  TrueFalseAnswerKey,
} from '../../database/schema';

export interface ChosenOption {
  readonly text: string | null;
  readonly value: boolean | null;
  readonly correct: boolean;
  readonly count: number;
}

export interface Distribution {
  readonly options: readonly ChosenOption[];
  readonly unanswered: number;
}

export interface AnsweredVersion {
  readonly key: QuestionAnswerKey;
  readonly response: AttemptResponse | null;
}

export const DISTRIBUTED_TYPES: readonly QuestionType[] = [
  'single_choice',
  'multiple_choice',
  'true_false',
];

export function distributionOf(
  type: QuestionType,
  latest: QuestionAnswerKey,
  answers: readonly AnsweredVersion[],
): Distribution | null {
  if (type === 'true_false') return trueFalse(latest as TrueFalseAnswerKey, answers);
  if (type === 'single_choice' || type === 'multiple_choice') {
    return choices(latest as ChoiceAnswerKey, answers);
  }

  return null;
}

function trueFalse(latest: TrueFalseAnswerKey, answers: readonly AnsweredVersion[]) {
  const counted = (value: boolean) =>
    answers.filter(
      ({ response }) => response !== null && 'value' in response && response.value === value,
    ).length;

  return {
    options: [true, false].map((value) => ({
      text: null,
      value,
      correct: latest.correct === value,
      count: counted(value),
    })),
    unanswered: answers.filter(({ response }) => response === null).length,
  };
}

function choices(latest: ChoiceAnswerKey, answers: readonly AnsweredVersion[]): Distribution {
  const options = new Map<string, { correct: boolean; count: number }>(
    latest.choices.map((choice) => [choice.text, { correct: choice.correct, count: 0 }]),
  );

  for (const { key, response } of answers) {
    if (response === null) continue;
    const picked =
      'choice' in response ? [response.choice] : 'choices' in response ? response.choices : [];
    for (const id of new Set(picked)) {
      const choice = (key as ChoiceAnswerKey).choices[id];
      if (!choice) continue;
      const option = options.get(choice.text) ?? { correct: choice.correct, count: 0 };
      options.set(choice.text, { ...option, count: option.count + 1 });
    }
  }

  return {
    options: [...options].map(([text, option]) => ({ text, value: null, ...option })),
    unanswered: answers.filter(({ response }) => response === null).length,
  };
}
