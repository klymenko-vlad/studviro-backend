import type { Database } from '../database.tokens';
import {
  assessments,
  learningActivities,
  questionCategories,
  questions,
  questionVersions,
  quizSlots,
  quizzes,
  type QuestionAnswerKey,
  type QuestionType,
} from '../schema';

import type { PlannedQuizBank } from './derive-quiz-bank';

export const QUIZ_POINTS = 10;

export interface WrittenVersion {
  readonly versionId: string;
  readonly type: QuestionType;
  readonly answerKey: QuestionAnswerKey;
}

export interface WrittenQuizBank {
  readonly quizId: string;
  readonly assessmentId: string;
  readonly versions: ReadonlyMap<string, WrittenVersion>;
  readonly slotIds: readonly string[];
}

export async function writeQuizBank(
  db: Database,
  institutionId: string,
  bank: PlannedQuizBank | null,
  spaceIds: ReadonlyMap<string, string>,
  sectionIds: ReadonlyMap<string, string>,
): Promise<WrittenQuizBank | null> {
  const learningSpaceId = bank ? spaceIds.get(bank.space.key) : undefined;
  if (!bank || learningSpaceId === undefined) return null;

  const categoryIds = new Map<string, string>();
  for (const category of bank.categories) {
    const [row] = await db
      .insert(questionCategories)
      .values({ institutionId, learningSpaceId, name: category.name })
      .returning({ id: questionCategories.id });
    if (row) categoryIds.set(category.key, row.id);
  }

  const questionIds = new Map<string, string>();
  const versions = new Map<string, WrittenVersion>();
  for (const planned of bank.questions) {
    const [question] = await db
      .insert(questions)
      .values({
        institutionId,
        learningSpaceId,
        categoryId: required(categoryIds, planned.categoryKey),
        type: planned.type,
      })
      .returning({ id: questions.id });
    if (!question) continue;

    const [version] = await db
      .insert(questionVersions)
      .values({
        institutionId,
        questionId: question.id,
        version: 1,
        name: planned.name,
        text: planned.text,
        defaultMark: planned.defaultMark.toFixed(4),
        generalFeedback: planned.generalFeedback,
        answerKey: planned.answerKey,
      })
      .returning({ id: questionVersions.id });
    questionIds.set(planned.key, question.id);
    if (version) {
      versions.set(planned.key, {
        versionId: version.id,
        type: planned.type,
        answerKey: planned.answerKey,
      });
    }
  }

  const { quiz } = bank;
  const [activity] = await db
    .insert(learningActivities)
    .values({
      institutionId,
      learningSpaceId,
      sectionId: sectionIds.get(quiz.sectionKey) ?? null,
      type: 'quiz',
      name: quiz.name,
      brief: quiz.brief,
      position: quiz.position,
      opensAt: quiz.opensAt,
      dueAt: quiz.closesAt,
      maxAttempts: quiz.maxAttempts,
      announcedAt: quiz.opensAt,
    })
    .returning({ id: learningActivities.id });
  if (!activity) return null;
  const learningActivityId = activity.id;

  const [assessment] = await db
    .insert(assessments)
    .values({
      institutionId,
      learningSpaceId,
      learningActivityId,
      name: quiz.name,
      maxPoints: QUIZ_POINTS.toFixed(4),
    })
    .returning({ id: assessments.id });
  if (!assessment) return null;
  await db.insert(quizzes).values({
    learningActivityId,
    institutionId,
    timeLimitSeconds: quiz.timeLimitMinutes * 60,
  });
  const slots = await db
    .insert(quizSlots)
    .values(
      quiz.slots.map((slot, position) => ({
        institutionId,
        learningActivityId,
        position,
        kind: slot.kind,
        mark: slot.mark.toFixed(4),
        ...(slot.kind === 'question'
          ? { questionId: required(questionIds, slot.questionKey) }
          : { categoryId: required(categoryIds, slot.categoryKey), pickCount: slot.pickCount }),
      })),
    )
    .returning({ id: quizSlots.id, position: quizSlots.position });

  return {
    quizId: learningActivityId,
    assessmentId: assessment.id,
    versions,
    slotIds: [...slots].sort((a, b) => a.position - b.position).map((slot) => slot.id),
  };
}

function required(ids: ReadonlyMap<string, string>, key: string): string {
  const id = ids.get(key);
  if (!id) throw new Error(`the demo seed wrote nothing for ${key}`);

  return id;
}
