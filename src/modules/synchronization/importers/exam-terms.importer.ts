import { Injectable } from '@nestjs/common';

import type {
  AcademicSystemCapability,
  AcademicSystemConnector,
} from '../../connectors/academic-system.connector';
import type { SisExamTerm } from '../../connectors/academic-system.records';
import type { ConnectorQuery, ConnectorRecord } from '../../connectors/connector.types';
import { ExamTermNotificationsService } from '../../notifications/exam-term-notifications.service';
import type { SyncSession } from '../sync-session';
import type { ApplyOutcome } from '../sync.types';

import { RecordImporter } from './academic.importer';

@Injectable()
export class ExamTermsImporter extends RecordImporter<SisExamTerm> {
  readonly domain = 'examTerms' as const;
  readonly capability: AcademicSystemCapability = 'examTerms.read';

  constructor(private readonly notifications: ExamTermNotificationsService) {
    super();
  }

  fetch(
    connector: AcademicSystemConnector,
    query: ConnectorQuery,
  ): Promise<ConnectorRecord<SisExamTerm>[]> {
    return connector.getExamTerms(query);
  }

  applyRecord(
    record: ConnectorRecord<SisExamTerm>,
    session: SyncSession,
  ): Promise<ApplyOutcome> {
    return session.apply(
      'examTerms',
      record,
      async () => ({
        courseOfferingId: await session.requireReference(
          'courseOfferings',
          record.data.courseOfferingExternalId,
        ),
        roomId: await session.reference('rooms', record.data.roomExternalId),
        examinerId: await session.user(record.data.examinerExternalId),
        kind: record.data.kind,
        startsAt: record.data.startsAt,
        endsAt: record.data.endsAt,
        capacity: record.data.capacity,
        registrationOpensAt: record.data.registrationOpensAt,
        registrationClosesAt: record.data.registrationClosesAt,
      }),
      (change) => this.notifications.applied(session.target, change, session.startedAt),
    );
  }
}
