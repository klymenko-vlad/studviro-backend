import type { QuizSlotKind } from '../../database/schema';

import { shuffled, type Random } from './attempt-presentation';

export interface DrawSlot {
  readonly id: string;
  readonly kind: QuizSlotKind;
  readonly questionId: string | null;
  readonly categoryId: string | null;
  readonly pickCount: number | null;
  readonly mark: number;
}

export interface DrawnQuestion {
  readonly slotId: string;
  readonly questionId: string;
  readonly mark: number;
}

export interface Draw {
  readonly questions: readonly DrawnQuestion[];
  readonly missing: number;
}

export function drawAttempt(
  slots: readonly DrawSlot[],
  pools: ReadonlyMap<string, readonly string[]>,
  shuffleQuestions: boolean,
  random: Random,
): Draw {
  const taken = new Set(
    slots.flatMap((slot) =>
      slot.kind === 'question' && slot.questionId ? [slot.questionId] : [],
    ),
  );
  let missing = 0;

  const questions = slots.flatMap((slot): DrawnQuestion[] => {
    if (slot.kind === 'question') {
      return slot.questionId
        ? [{ slotId: slot.id, questionId: slot.questionId, mark: slot.mark }]
        : [];
    }

    const wanted = slot.pickCount ?? 0;
    const available = (pools.get(slot.categoryId ?? '') ?? []).filter((id) => !taken.has(id));
    const picked = shuffled(available, random).slice(0, wanted);
    missing += wanted - picked.length;
    for (const id of picked) taken.add(id);

    return picked.map((questionId) => ({ slotId: slot.id, questionId, mark: slot.mark }));
  });

  return { questions: shuffleQuestions ? shuffled(questions, random) : questions, missing };
}
