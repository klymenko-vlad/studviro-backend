import type { LearningMaterial, LearningMaterialFile, Quiz } from '../../database/schema';

import type { ImportFlag, ImportRows } from './course-import.types';

export function copiesMaterial(material: LearningMaterial, flags: ImportFlag[]): boolean {
  if (material.kind !== 'file') return true;

  return copiesObject(material.storageKey, material.scanStatus, material.title, flags);
}

export function copiesFolderFile(file: LearningMaterialFile, flags: ImportFlag[]): boolean {
  return copiesObject(file.storageKey, file.scanStatus, file.filename, flags);
}

export function quizSettingsOf(
  quiz: Quiz | undefined,
): Omit<ImportRows['quizzes'][number], 'learningActivityId' | 'institutionId'> {
  if (quiz === undefined) return {};

  return {
    timeLimitSeconds: quiz.timeLimitSeconds,
    gradingMethod: quiz.gradingMethod,
    shuffleQuestions: quiz.shuffleQuestions,
    shuffleChoices: quiz.shuffleChoices,
    layout: quiz.layout,
    reviewResponses: quiz.reviewResponses,
    reviewCorrectness: quiz.reviewCorrectness,
    reviewCorrectAnswer: quiz.reviewCorrectAnswer,
    reviewFeedback: quiz.reviewFeedback,
    reviewOverallMark: quiz.reviewOverallMark,
  };
}

function copiesObject(
  storageKey: string | null,
  status: LearningMaterial['scanStatus'],
  title: string,
  flags: ImportFlag[],
): boolean {
  if (storageKey === null) {
    flags.push({ code: 'file_missing', title });

    return false;
  }
  if (status === 'pending') flags.push({ code: 'file_not_scanned', title });
  if (status === 'infected') flags.push({ code: 'file_infected', title });

  return status !== 'pending' && status !== 'infected';
}
