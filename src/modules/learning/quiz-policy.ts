import { InvalidInputError } from '../../common/errors/domain.error';
import type { QuizSlot } from '../../database/schema';

export const QUIZ_ATTEMPT_STATES = ['upcoming', 'open', 'closed'] as const;
export type QuizAttemptState = (typeof QUIZ_ATTEMPT_STATES)[number];

export const MAX_TIME_LIMIT_MINUTES = 24 * 60;
export const MAX_QUIZ_SLOTS = 100;
export const MAX_RANDOM_PICK = 50;

export interface QuizWindow {
  readonly opensAt?: Date | null;
  readonly closesAt?: Date | null;
}

export interface SlotTotals {
  readonly questionCount: number;
  readonly totalMarks: number;
}

export function assertQuizWindow({ opensAt, closesAt }: QuizWindow): void {
  if (!opensAt || !closesAt || opensAt.getTime() < closesAt.getTime()) return;

  throw new InvalidInputError('QUIZ_WINDOW_INVALID', 'A quiz closes after it opens');
}

export function attemptStateAt(window: QuizWindow, now: Date): QuizAttemptState {
  if (window.opensAt && now.getTime() < window.opensAt.getTime()) return 'upcoming';
  if (window.closesAt && now.getTime() >= window.closesAt.getTime()) return 'closed';

  return 'open';
}

export function slotTotals(
  slots: readonly Pick<QuizSlot, 'kind' | 'pickCount' | 'mark'>[],
): SlotTotals {
  return slots.reduce<SlotTotals>(
    (totals, slot) => {
      const questions = slot.kind === 'random' ? (slot.pickCount ?? 0) : 1;

      return {
        questionCount: totals.questionCount + questions,
        totalMarks: totals.totalMarks + questions * Number(slot.mark),
      };
    },
    { questionCount: 0, totalMarks: 0 },
  );
}

export const START_BLOCKS = ['upcoming', 'closed', 'no_attempts_left', 'no_questions'] as const;
export type StartBlock = (typeof START_BLOCKS)[number];

export interface StartFacts {
  readonly window: QuizWindow;
  readonly maxAttempts: number | null;
  readonly used: number;
  readonly questionCount: number;
}

export function startBlockOf(facts: StartFacts, now: Date): StartBlock | null {
  const state = attemptStateAt(facts.window, now);
  if (state !== 'open') return state;
  if (facts.maxAttempts !== null && facts.used >= facts.maxAttempts) return 'no_attempts_left';
  if (facts.questionCount === 0) return 'no_questions';

  return null;
}
