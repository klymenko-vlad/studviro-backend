export const TASK_STATES = ['open', 'done', 'all'] as const;
export type TaskState = (typeof TASK_STATES)[number];
