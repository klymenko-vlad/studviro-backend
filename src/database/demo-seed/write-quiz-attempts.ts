import { autoMarkOf, rounded } from '../../modules/learning/attempt-grading';
import { distinctAnswers, presentedOrderOf } from '../../modules/learning/attempt-presentation';
import { attemptScoreOf } from '../../modules/learning/attempt-score';
import { effectiveMarkOf } from '../../modules/learning/question-review';
import type { Database } from '../database.tokens';
import {
  assessmentResults,
  quizAttemptQuestions,
  quizAttempts,
  type AttemptResponse,
  type ChoiceAnswerKey,
  type MatchingAnswerKey,
  type NumericalAnswerKey,
  type PresentedOrder,
  type ShortAnswerKey,
  type TrueFalseAnswerKey,
} from '../schema';

import type { PlannedQuizAttempt } from './derive-quiz-attempts';
import type { PlannedQuizBank } from './derive-quiz-bank';
import { createRandom, seedFrom } from './deterministic-random';
import { QUIZ_POINTS, type WrittenQuizBank, type WrittenVersion } from './write-quiz-bank';

const MARKED_AFTER_MS = 2 * 60 * 60 * 1000;
const ESSAY_COMMENT = 'Right idea; say why a negative edge breaks it.';
const ESSAY =
  'A settled vertex is never looked at again, so a negative edge found later cannot lower its distance.';

export async function writeQuizAttempts(
  db: Database,
  institutionId: string,
  bank: PlannedQuizBank | null,
  written: WrittenQuizBank | null,
  attempts: readonly PlannedQuizAttempt[],
  personIds: ReadonlyMap<string, string>,
): Promise<number> {
  if (!bank || !written) return 0;
  const teacherKey = bank.space.offering.course.teachers[0]?.key;
  const markerId = teacherKey === undefined ? null : (personIds.get(teacherKey) ?? null);

  let count = 0;
  for (const planned of attempts) {
    const userId = personIds.get(planned.studentKey);
    if (!userId) continue;

    const random = createRandom(seedFrom(planned.studentKey));
    const drawn = [...planned.drawnKeys];
    const asked = bank.quiz.slots.flatMap((slot, index) => {
      const key = slot.kind === 'question' ? slot.questionKey : drawn.shift();
      const version = key ? written.versions.get(key) : undefined;
      if (!key || !version) return [];

      const order = presentedOrderOf(version.type, version.answerKey, true, (bound) =>
        random.int(0, bound - 1),
      );
      const response = responseOf(version, order, planned.wrongKeys.includes(key));
      const manualMark = version.type === 'essay' ? (planned.essayMark ?? null) : null;

      return [
        {
          slotId: written.slotIds[index] ?? null,
          version,
          mark: slot.mark,
          order,
          response,
          autoMark: autoMarkOf(version.type, version.answerKey, response, slot.mark),
          manualMark,
        },
      ];
    });

    const maxMarks = rounded(asked.reduce((sum, question) => sum + question.mark, 0));
    const { rawMarks, points, needsMarking } = attemptScoreOf(
      asked.map((question) => effectiveMarkOf(question.autoMark, question.manualMark)),
      maxMarks,
      QUIZ_POINTS,
    );
    const markedAt = new Date(planned.finishedAt.getTime() + MARKED_AFTER_MS);

    const [attempt] = await db
      .insert(quizAttempts)
      .values({
        institutionId,
        learningActivityId: written.quizId,
        userId,
        attempt: 1,
        state: 'finished',
        startedAt: planned.startedAt,
        deadlineAt: new Date(planned.startedAt.getTime() + 10 * 60 * 1000),
        deadlineCause: 'time_limit',
        finishedAt: planned.finishedAt,
        closedBy: 'student',
        maxMarks: maxMarks.toFixed(4),
        rawMarks: rawMarks.toFixed(4),
        points: (points ?? 0).toFixed(4),
        needsMarking,
      })
      .returning({ id: quizAttempts.id });
    if (!attempt) continue;

    await db.insert(quizAttemptQuestions).values(
      asked.map((question, position) => ({
        institutionId,
        attemptId: attempt.id,
        position,
        slotId: question.slotId,
        questionVersionId: question.version.versionId,
        mark: question.mark.toFixed(4),
        presentedOrder: question.order,
        response: question.response,
        answeredAt: planned.finishedAt,
        autoMark: question.autoMark === null ? null : question.autoMark.toFixed(4),
        ...(question.manualMark === null
          ? {}
          : {
              manualMark: question.manualMark.toFixed(4),
              comment: ESSAY_COMMENT,
              markedById: markerId,
              markedAt,
            }),
      })),
    );

    if (!needsMarking && points !== null) {
      const manual = asked.some((question) => question.manualMark !== null);
      await db.insert(assessmentResults).values({
        institutionId,
        assessmentId: written.assessmentId,
        userId,
        points: points.toFixed(4),
        normalizedScore: (points / QUIZ_POINTS).toFixed(4),
        gradedAt: manual ? markedAt : planned.finishedAt,
        gradedById: manual ? markerId : null,
      });
    }
    count += 1;
  }

  return count;
}

function responseOf(
  version: WrittenVersion,
  order: PresentedOrder | null,
  wrong: boolean,
): AttemptResponse {
  const key = version.answerKey;

  switch (version.type) {
    case 'single_choice':
    case 'multiple_choice': {
      const choices = (key as ChoiceAnswerKey).choices.map((choice, index) => ({
        ...choice,
        index,
      }));
      const right = choices.filter((choice) => choice.correct).map((choice) => choice.index);
      const first = choices.find((choice) => !choice.correct)?.index ?? 0;
      if (version.type === 'single_choice') return { choice: wrong ? first : (right[0] ?? 0) };

      return { choices: wrong ? [right[0] ?? 0, first] : right };
    }
    case 'true_false':
      return { value: (key as TrueFalseAnswerKey).correct !== wrong };
    case 'short_answer':
      return { text: wrong ? 'DFS' : ((key as ShortAnswerKey).acceptedAnswers[0] ?? '') };
    case 'numerical':
      return { text: String((key as NumericalAnswerKey).value + (wrong ? 1 : 0)) };
    case 'matching': {
      const matching = key as MatchingAnswerKey;
      const answers = distinctAnswers(matching);

      return {
        pairs: (order?.prompts ?? []).map((prompt) => ({
          prompt,
          answer: answers.indexOf(matching.pairs[prompt]?.answer ?? ''),
        })),
      };
    }
    case 'essay':
      return { text: ESSAY };
  }
}
