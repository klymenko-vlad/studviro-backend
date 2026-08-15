import { Injectable } from '@nestjs/common';

import type {
  AcademicSystemCapability,
  AcademicSystemConnector,
} from '../../connectors/academic-system.connector';
import type { SisCourse } from '../../connectors/academic-system.records';
import type { ConnectorQuery, ConnectorRecord } from '../../connectors/connector.types';
import type { SyncSession } from '../sync-session';
import type { ApplyOutcome } from '../sync.types';

import { RecordImporter } from './academic.importer';

@Injectable()
export class CoursesImporter extends RecordImporter<SisCourse> {
  readonly domain = 'courses' as const;
  readonly capability: AcademicSystemCapability = 'courses.read';

  fetch(
    connector: AcademicSystemConnector,
    query: ConnectorQuery,
  ): Promise<ConnectorRecord<SisCourse>[]> {
    return connector.getCourses(query);
  }

  applyRecord(record: ConnectorRecord<SisCourse>, session: SyncSession): Promise<ApplyOutcome> {
    return session.apply('courses', record, async () => ({
      orgUnitId: await session.reference('orgUnits', record.data.orgUnitExternalId),
      code: record.data.code,
      title: record.data.title,
      credits: String(record.data.credits),
    }));
  }
}
