import { Injectable } from '@nestjs/common';

import type {
  AcademicSystemCapability,
  AcademicSystemConnector,
} from '../../connectors/academic-system.connector';
import type { SisAcademicTerm } from '../../connectors/academic-system.records';
import type { ConnectorQuery, ConnectorRecord } from '../../connectors/connector.types';
import type { SyncSession } from '../sync-session';
import type { ApplyOutcome } from '../sync.types';

import { RecordImporter } from './academic.importer';

@Injectable()
export class AcademicTermsImporter extends RecordImporter<SisAcademicTerm> {
  readonly domain = 'academicTerms' as const;
  readonly capability: AcademicSystemCapability = 'academicTerms.read';

  fetch(
    connector: AcademicSystemConnector,
    query: ConnectorQuery,
  ): Promise<ConnectorRecord<SisAcademicTerm>[]> {
    return connector.getAcademicTerms(query);
  }

  applyRecord(
    record: ConnectorRecord<SisAcademicTerm>,
    session: SyncSession,
  ): Promise<ApplyOutcome> {
    return session.apply('academicTerms', record, () =>
      Promise.resolve({
        code: record.data.code,
        name: record.data.name,
        kind: record.data.kind,
        academicYear: record.data.academicYear,
        startsAt: record.data.startsAt,
        endsAt: record.data.endsAt,
        enrollmentOpensAt: record.data.enrollmentOpensAt,
        enrollmentClosesAt: record.data.enrollmentClosesAt,
      }),
    );
  }
}
