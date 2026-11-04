export interface ChoiceKey {
  readonly text: string;
  readonly correct: boolean;
  readonly feedback: string | null;
}

export interface ChoiceAnswerKey {
  readonly choices: readonly ChoiceKey[];
}

export interface TrueFalseAnswerKey {
  readonly correct: boolean;
  readonly trueFeedback: string | null;
  readonly falseFeedback: string | null;
}

export interface ShortAnswerKey {
  readonly acceptedAnswers: readonly string[];
  readonly caseSensitive: boolean;
}

export interface NumericalAnswerKey {
  readonly value: number;
  readonly tolerance: number;
}

export interface MatchingPair {
  readonly prompt: string;
  readonly answer: string;
}

export interface MatchingAnswerKey {
  readonly pairs: readonly MatchingPair[];
}

export type EssayAnswerKey = Record<string, never>;

export type QuestionAnswerKey =
  | ChoiceAnswerKey
  | TrueFalseAnswerKey
  | ShortAnswerKey
  | NumericalAnswerKey
  | MatchingAnswerKey
  | EssayAnswerKey;
