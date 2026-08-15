import { Injectable } from '@nestjs/common';

import type {
  AcademicSystemCapability,
  AcademicSystemConnector,
} from '../../connectors/academic-system.connector';
import type { SisProgram } from '../../connectors/academic-system.records';
import type { ConnectorQuery, ConnectorRecord } from '../../connectors/connector.types';
import type { SyncSession } from '../sync-session';
import type { ApplyOutcome } from '../sync.types';

import { RecordImporter } from './academic.importer';

@Injectable()
export class ProgramsImporter extends RecordImporter<SisProgram> {
  readonly domain = 'programs' as const;
  readonly capability: AcademicSystemCapability = 'programs.read';

  fetch(
    connector: AcademicSystemConnector,
    query: ConnectorQuery,
  ): Promise<ConnectorRecord<SisProgram>[]> {
    return connector.getPrograms(query);
  }

  applyRecord(
    record: ConnectorRecord<SisProgram>,
    session: SyncSession,
  ): Promise<ApplyOutcome> {
    return session.apply('programs', record, async () => ({
      orgUnitId: await session.reference('orgUnits', record.data.orgUnitExternalId),
      code: record.data.code,
      name: record.data.name,
      degreeLevel: record.data.degreeLevel,
      studyForm: record.data.studyForm,
      standardLengthSemesters: record.data.standardLengthSemesters,
    }));
  }
}
