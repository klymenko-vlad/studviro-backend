import type {
  LearningSystemCapability,
  LearningSystemConnector,
} from '../../connectors/learning-system.connector';

import { SourceRecordImporter, type SourceImporter } from './source.importer';

export const LEARNING_IMPORTERS = Symbol('LEARNING_IMPORTERS');

export type LearningImporter = SourceImporter<
  LearningSystemConnector,
  LearningSystemCapability
>;

export abstract class LearningRecordImporter<TData> extends SourceRecordImporter<
  LearningSystemConnector,
  LearningSystemCapability,
  TData
> {}
