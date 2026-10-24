import type {
  Assessment,
  LearningActivity,
  LearningMaterial,
  LearningMaterialFile,
  LearningSection,
  Question,
  QuestionCategory,
  QuestionVersion,
  Quiz,
  QuizSlot,
  assessments,
  learningActivities,
  learningMaterialFiles,
  learningMaterials,
  learningSections,
  questionCategories,
  questionVersions,
  questions,
  quizSlots,
  quizzes,
} from '../../database/schema';
import type { StorageKey } from '../storage/storage.types';

import type { DateShift } from './course-import-dates';

export const IMPORT_VISIBILITIES = ['hidden', 'source'] as const;
export type ImportVisibility = (typeof IMPORT_VISIBILITIES)[number];

export const IMPORT_FLAG_CODES = [
  'file_not_scanned',
  'file_infected',
  'file_missing',
  'group_dropped',
  'reference_missing',
  'category_renamed',
  'slot_dropped',
] as const;
export type ImportFlagCode = (typeof IMPORT_FLAG_CODES)[number];

export interface ImportFlag {
  readonly code: ImportFlagCode;
  readonly title: string;
}

export interface ImportSnapshot {
  readonly sections: readonly LearningSection[];
  readonly materials: readonly LearningMaterial[];
  readonly folderFiles: readonly LearningMaterialFile[];
  readonly activities: readonly { activity: LearningActivity; assessment: Assessment }[];
  readonly quizzes: readonly Quiz[];
  readonly slots: readonly QuizSlot[];
  readonly categories: readonly QuestionCategory[];
  readonly questions: readonly { question: Question; version: QuestionVersion }[];
}

export interface ImportCounts {
  readonly sections: number;
  readonly materials: number;
  readonly files: number;
  readonly assignments: number;
  readonly quizzes: number;
  readonly quizSlots: number;
  readonly questionCategories: number;
  readonly questions: number;
}

export interface ImportReport {
  readonly counts: ImportCounts;
  readonly shift: DateShift;
  readonly shiftedDates: number;
  readonly remappedReferences: number;
  readonly visibility: ImportVisibility;
  readonly flags: readonly ImportFlag[];
}

export interface ObjectCopy {
  readonly from: StorageKey;
  readonly to: StorageKey;
}

export interface ImportRows {
  readonly sections: (typeof learningSections.$inferInsert)[];
  readonly materials: (typeof learningMaterials.$inferInsert)[];
  readonly folderFiles: (typeof learningMaterialFiles.$inferInsert)[];
  readonly activities: (typeof learningActivities.$inferInsert)[];
  readonly assessments: (typeof assessments.$inferInsert)[];
  readonly quizzes: (typeof quizzes.$inferInsert)[];
  readonly categories: (typeof questionCategories.$inferInsert)[];
  readonly questions: (typeof questions.$inferInsert)[];
  readonly questionVersions: (typeof questionVersions.$inferInsert)[];
  readonly slots: (typeof quizSlots.$inferInsert)[];
}

export interface ImportPlan {
  readonly rows: ImportRows;
  readonly copies: readonly ObjectCopy[];
  readonly report: ImportReport;
}
