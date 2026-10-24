import type { Database } from '../database.tokens';
import {
  assessments,
  learningActivities,
  questionCategories,
  questions,
  questionVersions,
  quizSlots,
  quizzes,
} from '../schema';

import type { PlannedQuizBank } from './derive-quiz-bank';

const QUIZ_POINTS = 10;

export async function writeQuizBank(
  db: Database,
  institutionId: string,
  bank: PlannedQuizBank | null,
  spaceIds: ReadonlyMap<string, string>,
  sectionIds: ReadonlyMap<string, string>,
): Promise<void> {
  const learningSpaceId = bank ? spaceIds.get(bank.space.key) : undefined;
  if (!bank || learningSpaceId === undefined) return;

  const categoryIds = new Map<string, string>();
  for (const category of bank.categories) {
    const [row] = await db
      .insert(questionCategories)
      .values({ institutionId, learningSpaceId, name: category.name })
      .returning({ id: questionCategories.id });
    if (row) categoryIds.set(category.key, row.id);
  }

  const questionIds = new Map<string, string>();
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

    await db.insert(questionVersions).values({
      institutionId,
      questionId: question.id,
      version: 1,
      name: planned.name,
      text: planned.text,
      defaultMark: planned.defaultMark.toFixed(4),
      generalFeedback: planned.generalFeedback,
      answerKey: planned.answerKey,
    });
    questionIds.set(planned.key, question.id);
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
  if (!activity) return;
  const learningActivityId = activity.id;

  await db.insert(assessments).values({
    institutionId,
    learningSpaceId,
    learningActivityId,
    name: quiz.name,
    maxPoints: QUIZ_POINTS.toFixed(4),
  });
  await db.insert(quizzes).values({
    learningActivityId,
    institutionId,
    timeLimitSeconds: quiz.timeLimitMinutes * 60,
  });
  await db.insert(quizSlots).values(
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
  );
}

function required(ids: ReadonlyMap<string, string>, key: string): string {
  const id = ids.get(key);
  if (!id) throw new Error(`the demo seed wrote nothing for ${key}`);

  return id;
}
