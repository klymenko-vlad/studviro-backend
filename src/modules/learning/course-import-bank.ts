import { freeCategoryName } from './course-import-names';
import type { ImportFlag, ImportRows, ImportSnapshot } from './course-import.types';

export interface BankPlanInput {
  readonly snapshot: Pick<ImportSnapshot, 'categories' | 'questions' | 'slots'>;
  readonly institutionId: string;
  readonly spaceId: string;
  readonly userId: string;
  readonly quizIds: ReadonlyMap<string, string>;
  readonly quizNames: ReadonlyMap<string, string>;
  readonly takenCategoryNames: readonly string[];
  readonly categorySuffix: string;
  readonly newId: () => string;
}

export type BankRows = Pick<
  ImportRows,
  'categories' | 'questions' | 'questionVersions' | 'slots'
>;

export function planBank(input: BankPlanInput): { rows: BankRows; flags: ImportFlag[] } {
  const { snapshot, institutionId, spaceId, userId, newId } = input;
  const flags: ImportFlag[] = [];
  const taken = new Set(input.takenCategoryNames.map((name) => name.trim().toLowerCase()));

  const categoryIds = new Map<string, string>();
  const categories = snapshot.categories.map((category) => {
    const id = newId();
    categoryIds.set(category.id, id);
    const name = freeCategoryName(category.name, taken, input.categorySuffix);
    if (name !== category.name) flags.push({ code: 'category_renamed', title: name });

    return { id, institutionId, learningSpaceId: spaceId, name };
  });

  const questionIds = new Map<string, string>();
  const questions: BankRows['questions'] = [];
  const questionVersions: BankRows['questionVersions'] = [];
  for (const { question, version } of snapshot.questions) {
    const categoryId = categoryIds.get(question.categoryId);
    if (categoryId === undefined) continue;

    const id = newId();
    questionIds.set(question.id, id);
    questions.push({
      id,
      institutionId,
      learningSpaceId: spaceId,
      categoryId,
      type: question.type,
      latestVersion: 1,
      createdById: userId,
    });
    questionVersions.push({
      institutionId,
      questionId: id,
      version: 1,
      name: version.name,
      text: version.text,
      defaultMark: version.defaultMark,
      generalFeedback: version.generalFeedback,
      answerKey: version.answerKey,
      createdById: userId,
    });
  }

  const slots: BankRows['slots'] = [];
  for (const slot of snapshot.slots) {
    const quizId = input.quizIds.get(slot.learningActivityId);
    if (quizId === undefined) continue;

    const questionId = slot.questionId === null ? null : questionIds.get(slot.questionId);
    const categoryId = slot.categoryId === null ? null : categoryIds.get(slot.categoryId);
    if (questionId === undefined || categoryId === undefined) {
      flags.push({
        code: 'slot_dropped',
        title: input.quizNames.get(slot.learningActivityId) ?? '',
      });
      continue;
    }

    slots.push({
      institutionId,
      learningActivityId: quizId,
      position: slot.position,
      kind: slot.kind,
      questionId,
      categoryId,
      pickCount: slot.pickCount,
      mark: slot.mark,
    });
  }

  return { rows: { categories, questions, questionVersions, slots }, flags };
}
