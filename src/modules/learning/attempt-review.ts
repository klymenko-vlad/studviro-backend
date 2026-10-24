import type { AttemptResponse, QuestionType } from '../../database/schema';

import { presentedParts, type PresentedParts } from './attempt-presentation';
import type { AskedQuestion } from './attempt-questions.repository';
import { numberOf } from './attempt-score';
import {
  effectiveMarkOf,
  outcomeOf,
  revealedKeyOf,
  specificFeedbackOf,
  type QuestionOutcome,
  type RevealedKey,
} from './question-review';
import type { ReviewShown } from './quiz-review';

export interface QuestionReview {
  readonly position: number;
  readonly type: QuestionType;
  readonly text: string;
  readonly mark: number;
  readonly parts: PresentedParts;
  readonly response: AttemptResponse | null;
  readonly outcome: QuestionOutcome | null;
  readonly awarded: number | null;
  readonly key: RevealedKey | null;
  readonly generalFeedback: string | null;
  readonly specificFeedback: readonly string[];
  readonly comment: string | null;
}

export const EVERYTHING: ReviewShown = {
  responses: true,
  correctness: true,
  correctAnswer: true,
  feedback: true,
  overallMark: true,
};

export function showsQuestions(shown: ReviewShown): boolean {
  return shown.responses || shown.correctness || shown.correctAnswer || shown.feedback;
}

export function reviewOf(asked: AskedQuestion, shown: ReviewShown): QuestionReview {
  const { row } = asked;
  const mark = Number(row.mark);
  const effective = effectiveMarkOf(numberOf(row.autoMark), numberOf(row.manualMark));

  return {
    position: row.position,
    type: asked.type,
    text: asked.text,
    mark,
    parts: presentedParts(asked.type, asked.answerKey, row.presentedOrder),
    response: shown.responses ? row.response : null,
    outcome: shown.correctness ? outcomeOf(effective, mark, row.response) : null,
    awarded: shown.correctness ? effective : null,
    key: shown.correctAnswer ? revealedKeyOf(asked.type, asked.answerKey) : null,
    generalFeedback: shown.feedback ? asked.generalFeedback : null,
    specificFeedback: shown.feedback
      ? specificFeedbackOf(asked.type, asked.answerKey, row.response)
      : [],
    comment: shown.feedback ? row.comment : null,
  };
}
