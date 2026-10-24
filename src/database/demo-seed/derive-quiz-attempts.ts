import { addDays, addHours } from './calendar';
import type { PlannedEnrollment } from './derive';
import type { PlannedQuizBank } from './derive-quiz-bank';

export interface PlannedQuizAttempt {
  readonly studentKey: string;
  readonly startedAt: Date;
  readonly finishedAt: Date;
  readonly drawnKeys: readonly string[];
  readonly wrongKeys: readonly string[];
}

const FIRST_ATTEMPT_AFTER_DAYS = 2;
const START_HOUR = 9;
const MINUTES_TAKEN = 7;
const MINUTE = 60 * 1000;

export function planQuizAttempts(
  bank: PlannedQuizBank | null,
  enrollments: readonly PlannedEnrollment[],
): PlannedQuizAttempt[] {
  if (!bank) return [];

  const cohort = enrollments.filter(
    (enrollment) =>
      enrollment.offering.key === bank.space.offering.key && enrollment.status === 'active',
  );
  const takers = cohort.filter((_, index) => index % 2 === 0);

  return takers.map((enrollment, index) => {
    const startedAt = addHours(
      addDays(bank.quiz.opensAt, FIRST_ATTEMPT_AFTER_DAYS + index),
      START_HOUR,
    );

    return {
      studentKey: enrollment.student.person.key,
      startedAt,
      finishedAt: new Date(startedAt.getTime() + MINUTES_TAKEN * MINUTE),
      drawnKeys: bank.quiz.slots.flatMap((slot) => {
        if (slot.kind === 'question') return [];

        const pool = bank.questions.filter(
          (question) => question.categoryKey === slot.categoryKey,
        );
        const drawn = pool[index % Math.max(pool.length, 1)];

        return drawn ? [drawn.key] : [];
      }),
      wrongKeys: index % 2 === 1 ? [keyOfType(bank, 'multiple_choice')] : [],
    };
  });
}

function keyOfType(bank: PlannedQuizBank, type: string): string {
  return bank.questions.find((question) => question.type === type)?.key ?? '';
}
