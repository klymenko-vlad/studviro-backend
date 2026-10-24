import type { LearningActivityType } from '../../database/schema';

export const ACTIVITY_KINDS = [
  'assignment',
  'quiz',
] as const satisfies readonly LearningActivityType[];
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export function activityKindOf(type: LearningActivityType): ActivityKind {
  return type === 'quiz' ? 'quiz' : 'assignment';
}
