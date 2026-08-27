import { Injectable } from '@nestjs/common';

import type {
  AcademicSystemCapability,
  AcademicSystemConnector,
} from '../../connectors/academic-system.connector';
import type { SisProgramMembership } from '../../connectors/academic-system.records';
import type { ConnectorQuery, ConnectorRecord } from '../../connectors/connector.types';
import type { SyncSession } from '../sync-session';
import type { ApplyOutcome } from '../sync.types';

import { RecordImporter } from './academic.importer';

@Injectable()
export class ProgramMembershipsImporter extends RecordImporter<SisProgramMembership> {
  readonly domain = 'programMemberships' as const;
  readonly capability: AcademicSystemCapability = 'programMemberships.read';

  fetch(
    connector: AcademicSystemConnector,
    query: ConnectorQuery,
  ): Promise<ConnectorRecord<SisProgramMembership>[]> {
    return connector.getProgramMemberships(query);
  }

  applyRecord(
    record: ConnectorRecord<SisProgramMembership>,
    session: SyncSession,
  ): Promise<ApplyOutcome> {
    return session.apply('programMemberships', record, async () => ({
      programId: await session.requireReference('programs', record.data.programExternalId),
      userId: await session.requireUser(record.data.personExternalId),
      studyYear: record.data.studyYear,
    }));
  }
}
