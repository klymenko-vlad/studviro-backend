import { planActivities } from './course-import-activities';
import { planBank } from './course-import-bank';
import { ImportPlanContext, type ImportPlanInput } from './course-import-context';
import { copiesMaterial } from './course-import-files';
import { planFolderFiles, planMaterials, planSections } from './course-import-outline';
import type { ImportFlag, ImportPlan } from './course-import.types';

export type { ImportPlanInput } from './course-import-context';

export function planImport(input: ImportPlanInput): ImportPlan {
  const { snapshot } = input;
  const skipped: ImportFlag[] = [];
  const copied = snapshot.materials.filter((material) => copiesMaterial(material, skipped));
  const context = new ImportPlanContext(input, copied);
  context.flags.push(...skipped);

  const sections = planSections(context, snapshot.sections);
  const materials = planMaterials(context, copied);
  const folderFiles = planFolderFiles(context, snapshot.folderFiles);
  const activities = planActivities(context, snapshot);
  const quizzes = snapshot.activities.filter(({ activity }) => activity.type === 'quiz');
  const bank = planBank({
    snapshot,
    institutionId: input.institutionId,
    spaceId: input.spaceId,
    userId: input.userId,
    quizIds: new Map(
      quizzes.map(({ activity }) => [activity.id, context.activityIdOf(activity)]),
    ),
    quizNames: new Map(quizzes.map(({ activity }) => [activity.id, activity.name])),
    takenCategoryNames: input.takenCategoryNames,
    categorySuffix: input.categorySuffix,
    newId: input.newId,
  });
  context.flags.push(...bank.flags);

  return {
    rows: { sections, materials, folderFiles, ...activities, ...bank.rows },
    copies: context.copies,
    report: {
      counts: {
        sections: sections.length,
        materials: materials.length,
        files: context.copies.length,
        assignments: activities.activities.length - activities.quizzes.length,
        quizzes: activities.quizzes.length,
        quizSlots: bank.rows.slots.length,
        questionCategories: bank.rows.categories.length,
        questions: bank.rows.questions.length,
      },
      shift: input.shift,
      shiftedDates: context.shiftedDates,
      remappedReferences: context.remappedReferences,
      visibility: input.visibility,
      flags: context.flags,
    },
  };
}
