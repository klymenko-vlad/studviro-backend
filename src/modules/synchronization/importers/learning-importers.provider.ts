import type { Provider } from '@nestjs/common';

import { LearningActivitiesImporter } from './learning-activities.importer';
import { LearningSpacesImporter } from './learning-spaces.importer';
import { LEARNING_IMPORTERS, type LearningImporter } from './learning.importer';

export const LEARNING_IMPORTER_CLASSES = [LearningSpacesImporter, LearningActivitiesImporter];

export const learningImportersProvider: Provider = {
  provide: LEARNING_IMPORTERS,
  useFactory: (...importers: LearningImporter[]) => importers,
  inject: LEARNING_IMPORTER_CLASSES,
};
