import type { Provider } from '@nestjs/common';

import { ActivityCompletionsImporter } from './activity-completions.importer';
import { AssessmentResultsImporter } from './assessment-results.importer';
import { AssessmentsImporter } from './assessments.importer';
import { LearningActivitiesImporter } from './learning-activities.importer';
import { LearningSpacesImporter } from './learning-spaces.importer';
import { LEARNING_IMPORTERS, type LearningImporter } from './learning.importer';
import { SubmissionRefsImporter } from './submission-refs.importer';

/** Dependency order: a space, then its activities, then what hangs off them. */
export const LEARNING_IMPORTER_CLASSES = [
  LearningSpacesImporter,
  LearningActivitiesImporter,
  AssessmentsImporter,
  AssessmentResultsImporter,
  ActivityCompletionsImporter,
  SubmissionRefsImporter,
];

export const learningImportersProvider: Provider = {
  provide: LEARNING_IMPORTERS,
  useFactory: (...importers: LearningImporter[]) => importers,
  inject: LEARNING_IMPORTER_CLASSES,
};
