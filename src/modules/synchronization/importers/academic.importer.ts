import type {
  AcademicSystemCapability,
  AcademicSystemConnector,
} from '../../connectors/academic-system.connector';

import { SourceRecordImporter, type SourceImporter } from './source.importer';

export const ACADEMIC_IMPORTERS = Symbol('ACADEMIC_IMPORTERS');

export type AcademicImporter = SourceImporter<
  AcademicSystemConnector,
  AcademicSystemCapability
>;

export abstract class RecordImporter<TData> extends SourceRecordImporter<
  AcademicSystemConnector,
  AcademicSystemCapability,
  TData
> {}
