import { Injectable } from '@nestjs/common';

import type {
  AcademicSystemCapability,
  AcademicSystemConnector,
} from '../../connectors/academic-system.connector';
import type { SisOfficialResult } from '../../connectors/academic-system.records';
import type { ConnectorQuery, ConnectorRecord } from '../../connectors/connector.types';
import type { SyncSession } from '../sync-session';
import type { ApplyOutcome } from '../sync.types';

import { RecordImporter } from './academic.importer';

@Injectable()
export class OfficialResultsImporter extends RecordImporter<SisOfficialResult> {
  readonly domain = 'officialResults' as const;
  readonly capability: AcademicSystemCapability = 'officialResults.read';

  fetch(
    connector: AcademicSystemConnector,
    query: ConnectorQuery,
  ): Promise<ConnectorRecord<SisOfficialResult>[]> {
    return connector.getOfficialResults(query);
  }

  applyRecord(
    record: ConnectorRecord<SisOfficialResult>,
    session: SyncSession,
  ): Promise<ApplyOutcome> {
    return session.apply('officialCourseResults', record, async () => ({
      enrollmentId: await session.requireReference(
        'enrollments',
        record.data.enrollmentExternalId,
      ),
      status: 'official' as const,
      officialGrade: record.data.grade,
      officialRecordedAt: record.data.recordedAt,
    }));
  }
}
