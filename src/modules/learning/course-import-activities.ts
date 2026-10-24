import type { ImportPlanContext } from './course-import-context';
import { quizSettingsOf } from './course-import-files';
import type { ImportRows, ImportSnapshot } from './course-import.types';

export type ActivityRows = Pick<ImportRows, 'activities' | 'assessments' | 'quizzes'>;

export function planActivities(
  context: ImportPlanContext,
  snapshot: Pick<ImportSnapshot, 'activities' | 'quizzes'>,
): ActivityRows {
  const { institutionId, spaceId } = context.input;
  const settings = new Map(snapshot.quizzes.map((quiz) => [quiz.learningActivityId, quiz]));
  const rows: { [K in keyof ActivityRows]: ActivityRows[K][number][] } = {
    activities: [],
    assessments: [],
    quizzes: [],
  };

  for (const { activity, assessment } of snapshot.activities) {
    const id = context.activityIdOf(activity);
    const place = context.placeOf(activity);
    const { restriction, lostGroups } = context.restrictionOf(
      activity.restriction,
      activity.name,
    );

    rows.activities.push({
      id,
      institutionId,
      learningSpaceId: spaceId,
      ...place,
      type: activity.type,
      name: activity.name,
      brief: activity.brief,
      opensAt: context.shifted(activity.opensAt),
      dueAt: context.shifted(activity.dueAt),
      closesAt: context.shifted(activity.closesAt),
      maxAttempts: activity.maxAttempts,
      allowsLateSubmission: activity.allowsLateSubmission,
      visible: context.visibleOf(place.sectionId, activity.visible, lostGroups),
      availableFrom: context.shifted(activity.availableFrom),
      availableUntil: context.shifted(activity.availableUntil),
      hiddenUntilAvailable: activity.hiddenUntilAvailable,
      restriction,
      announcedAt: null,
      completionRule: activity.completionRule,
      completionPassPoints: activity.completionPassPoints,
    });
    rows.assessments.push({
      institutionId,
      learningSpaceId: spaceId,
      learningActivityId: id,
      name: assessment.name,
      maxPoints: assessment.maxPoints,
      weight: assessment.weight,
      countsTowardFinalGrade: assessment.countsTowardFinalGrade,
    });
    if (activity.type === 'quiz') {
      rows.quizzes.push({
        ...quizSettingsOf(settings.get(activity.id)),
        learningActivityId: id,
        institutionId,
      });
    }
  }

  return rows;
}
