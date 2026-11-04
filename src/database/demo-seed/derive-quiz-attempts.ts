import { addDays, addHours } from './calendar';
import type { PlannedEnrollment } from './derive';
import type { PlannedQuizBank } from './derive-quiz-bank';

export interface PlannedQuizAttempt {
  readonly studentKey: string;
  readonly startedAt: Date;
  readonly finishedAt: Date;
  readonly drawnKeys: readonly string[];
  readonly wrongKeys: readonly string[];
  readonly essayMark?: number | null;
}

const FIRST_ATTEMPT_AFTER_DAYS = 2;
const START_HOUR = 9;
const MINUTES_TAKEN = 7;
const MINUTE = 60 * 1000;
const ESSAY_MARKS = [1.5, 2] as const;

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

  return withEssayMarks(
    bank,
    takers.map((enrollment, index) => {
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
    }),
  );
}

function withEssayMarks(
  bank: PlannedQuizBank,
  attempts: readonly PlannedQuizAttempt[],
): PlannedQuizAttempt[] {
  const essay = keyOfType(bank, 'essay');
  const essays = attempts.filter((attempt) => attempt.drawnKeys.includes(essay));
  const latest = Math.max(...essays.map((attempt) => attempt.finishedAt.getTime()));

  return attempts.map((attempt) => {
    const position = essays.indexOf(attempt);
    if (position === -1) return attempt;

    return {
      ...attempt,
      essayMark:
        attempt.finishedAt.getTime() === latest
          ? null
          : ESSAY_MARKS[position % ESSAY_MARKS.length],
    };
  });
}

function keyOfType(bank: PlannedQuizBank, type: string): string {
  return bank.questions.find((question) => question.type === type)?.key ?? '';
}
