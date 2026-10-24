export interface PresentedOrder {
  readonly choices?: readonly number[];
  readonly prompts?: readonly number[];
  readonly answers?: readonly number[];
}

export interface MatchedPair {
  readonly prompt: number;
  readonly answer: number;
}

export type AttemptResponse =
  | { readonly choice: number }
  | { readonly choices: readonly number[] }
  | { readonly value: boolean }
  | { readonly text: string }
  | { readonly pairs: readonly MatchedPair[] };
