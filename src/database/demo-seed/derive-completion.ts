import { addDays } from './calendar';
import type { PlannedEnrollment } from './derive';
import type {
  PlannedAssignment,
  PlannedMaterial,
  PlannedSpace,
  PlannedSubmission,
} from './derive-learning';
import type { DemoSeedOptions } from './options';

export interface PlannedCompletion {
  readonly target: { kind: 'material' | 'assignment'; key: string };
  readonly studentKey: string;
  readonly state: 'complete' | 'complete_pass' | 'complete_fail';
  readonly completedAt: Date | null;
  readonly viewedAt: Date | null;
  readonly markedDoneAt: Date | null;
}

type Habit = (index: number) => boolean;

const MATERIAL_HABITS: Readonly<Record<string, { habit: Habit; afterDays: number }>> = {
  rules: { habit: (index) => index % 4 !== 3, afterDays: 1 },
  slides: { habit: (index) => index % 3 !== 2, afterDays: 3 },
  reading: { habit: (index) => index % 2 === 0, afterDays: 9 },
};

export function planCompletions(
  spaces: readonly PlannedSpace[],
  materials: readonly PlannedMaterial[],
  assignments: readonly PlannedAssignment[],
  submissions: readonly PlannedSubmission[],
  enrollments: readonly PlannedEnrollment[],
  options: DemoSeedOptions,
): PlannedCompletion[] {
  return [
    ...spaces.flatMap((space) =>
      materialCompletions(space, materials, cohortOf(space, enrollments), options),
    ),
    ...assignmentCompletions(assignments, submissions),
  ];
}

function cohortOf(space: PlannedSpace, enrollments: readonly PlannedEnrollment[]) {
  return enrollments.filter((enrollment) => enrollment.offering.key === space.offering.key);
}

function materialCompletions(
  space: PlannedSpace,
  materials: readonly PlannedMaterial[],
  cohort: readonly PlannedEnrollment[],
  options: DemoSeedOptions,
): PlannedCompletion[] {
  return materials
    .filter((material) => material.spaceKey === space.key && material.availableFrom === null)
    .flatMap((material) => {
      const slug = material.key.slice(`MAT-${space.key}-`.length);
      const plan = MATERIAL_HABITS[slug];
      if (!plan || material.completionRule === 'none') return [];

      return cohort.flatMap((enrollment, index): PlannedCompletion[] => {
        const at = addDays(space.offering.term.startsAt, plan.afterDays + (index % 3));
        if (!plan.habit(index) || at > options.anchor) return [];

        const manual = material.completionRule === 'manual';

        return [
          {
            target: { kind: 'material', key: material.key },
            studentKey: enrollment.student.person.key,
            state: 'complete',
            completedAt: at,
            viewedAt: manual ? null : at,
            markedDoneAt: manual ? at : null,
          },
        ];
      });
    });
}

function assignmentCompletions(
  assignments: readonly PlannedAssignment[],
  submissions: readonly PlannedSubmission[],
): PlannedCompletion[] {
  const byKey = new Map(assignments.map((assignment) => [assignment.key, assignment]));

  return submissions.flatMap((submission): PlannedCompletion[] => {
    const assignment = byKey.get(submission.assignmentKey);
    if (!assignment || submission.submittedAt === null) return [];

    const target = { kind: 'assignment' as const, key: assignment.key };
    const base = {
      target,
      studentKey: submission.studentKey,
      completedAt: submission.submittedAt,
      viewedAt: null,
      markedDoneAt: null,
    };

    if (assignment.completionRule === 'submitted') return [{ ...base, state: 'complete' }];
    if (submission.points === null || assignment.completionPassPoints === null) return [];

    return [
      {
        ...base,
        state:
          submission.points >= assignment.completionPassPoints
            ? 'complete_pass'
            : 'complete_fail',
      },
    ];
  });
}
