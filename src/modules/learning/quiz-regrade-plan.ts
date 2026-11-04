import type {
  AttemptResponse,
  ChoiceAnswerKey,
  MatchingAnswerKey,
  QuestionAnswerKey,
  QuestionType,
  QuizGradingMethod,
} from '../../database/schema';

import { autoMarkOf } from './attempt-grading';
import { distinctAnswers } from './attempt-presentation';
import { attemptScoreOf } from './attempt-score';
import { effectiveMarkOf } from './question-review';
import { quizGradeOf } from './quiz-grade';

export interface RegradeQuestion {
  readonly rowId: string;
  readonly questionId: string;
  readonly versionId: string;
  readonly type: QuestionType;
  readonly key: QuestionAnswerKey;
  readonly mark: number;
  readonly response: AttemptResponse | null;
  readonly autoMark: number | null;
  readonly manualMark: number | null;
}

export interface RegradeAttempt {
  readonly id: string;
  readonly userId: string;
  readonly attempt: number;
  readonly maxMarks: number;
  readonly points: number | null;
  readonly needsMarking: boolean;
  readonly questions: readonly RegradeQuestion[];
}

export interface LatestVersion {
  readonly versionId: string;
  readonly key: QuestionAnswerKey;
}

export interface RegradeGrading {
  readonly method: QuizGradingMethod;
  readonly maxPoints: number | null;
}

export interface AttemptUpdate {
  readonly attemptId: string;
  readonly userId: string;
  readonly questions: readonly { rowId: string; versionId: string; autoMark: number | null }[];
  readonly rawMarks: number;
  readonly points: number | null;
  readonly changed: boolean;
}

export interface GradeChange {
  readonly userId: string;
  readonly before: number | null;
  readonly after: number | null;
}

export interface RegradePlan {
  readonly outdatedAttempts: number;
  readonly incompatible: number;
  readonly updates: readonly AttemptUpdate[];
  readonly students: readonly GradeChange[];
}

export function canRegrade(
  type: QuestionType,
  from: QuestionAnswerKey,
  to: QuestionAnswerKey,
): boolean {
  if (type === 'single_choice' || type === 'multiple_choice') {
    return (from as ChoiceAnswerKey).choices.length === (to as ChoiceAnswerKey).choices.length;
  }
  if (type === 'matching') {
    const before = from as MatchingAnswerKey;
    const after = to as MatchingAnswerKey;

    return (
      before.pairs.length === after.pairs.length &&
      distinctAnswers(before).length === distinctAnswers(after).length
    );
  }

  return true;
}

export function planRegrade(
  attempts: readonly RegradeAttempt[],
  latest: ReadonlyMap<string, LatestVersion>,
  grading: RegradeGrading,
): RegradePlan {
  let outdatedAttempts = 0;
  let incompatible = 0;
  const updates: AttemptUpdate[] = [];
  const pointsAfter = new Map<string, number | null>();

  for (const attempt of attempts) {
    const outdated = attempt.questions.filter((question) => {
      const version = latest.get(question.questionId);

      return version !== undefined && version.versionId !== question.versionId;
    });
    if (outdated.length === 0) continue;
    outdatedAttempts++;

    const moved = new Map<string, { versionId: string; autoMark: number | null }>();
    for (const question of outdated) {
      const version = latest.get(question.questionId);
      if (!version) continue;
      if (!canRegrade(question.type, question.key, version.key)) {
        incompatible++;
        continue;
      }
      moved.set(question.rowId, {
        versionId: version.versionId,
        autoMark: autoMarkOf(question.type, version.key, question.response, question.mark),
      });
    }
    if (moved.size === 0) continue;

    const score = attemptScoreOf(
      attempt.questions.map((question) =>
        effectiveMarkOf(
          moved.get(question.rowId)?.autoMark ?? question.autoMark,
          question.manualMark,
        ),
      ),
      attempt.maxMarks,
      grading.maxPoints,
    );
    updates.push({
      attemptId: attempt.id,
      userId: attempt.userId,
      questions: [...moved].map(([rowId, change]) => ({ rowId, ...change })),
      rawMarks: score.rawMarks,
      points: score.points,
      changed: score.points !== attempt.points,
    });
    pointsAfter.set(attempt.id, score.points);
  }

  return {
    outdatedAttempts,
    incompatible,
    updates,
    students: gradeChanges(attempts, pointsAfter, grading),
  };
}

function gradeChanges(
  attempts: readonly RegradeAttempt[],
  pointsAfter: ReadonlyMap<string, number | null>,
  grading: RegradeGrading,
): GradeChange[] {
  const affected = new Set(
    attempts.filter((attempt) => pointsAfter.has(attempt.id)).map((attempt) => attempt.userId),
  );

  return [...affected].flatMap((userId) => {
    const own = attempts.filter((attempt) => attempt.userId === userId);
    const gradeOf = (after: boolean) =>
      quizGradeOf(
        grading.method,
        own.map((attempt) => ({
          attempt: attempt.attempt,
          points: attempt.needsMarking
            ? null
            : after && pointsAfter.has(attempt.id)
              ? (pointsAfter.get(attempt.id) ?? null)
              : attempt.points,
        })),
      );
    const before = gradeOf(false);
    const after = gradeOf(true);

    return before === after ? [] : [{ userId, before, after }];
  });
}
