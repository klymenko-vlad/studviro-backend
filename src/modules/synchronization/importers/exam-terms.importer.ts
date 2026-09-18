import { Injectable } from '@nestjs/common';

import type { ExamTerm } from '../../../database/schema';
import type {
  AcademicSystemCapability,
  AcademicSystemConnector,
} from '../../connectors/academic-system.connector';
import type { SisExamTerm } from '../../connectors/academic-system.records';
import type { ConnectorQuery, ConnectorRecord } from '../../connectors/connector.types';
import { ExamTermNotificationsService } from '../../notifications/exam-term-notifications.service';
import { ExamTermCancellationService } from '../../scheduling/exam-term-cancellation.service';
import type { SyncSession } from '../sync-session';
import type { AppliedChange, ApplyOutcome } from '../sync.types';

import { RecordImporter } from './academic.importer';

function becameCancelled(change: AppliedChange<ExamTerm>): boolean {
  if (change.outcome === 'deleted') return true;

  return (
    change.current?.cancelledAt !== null &&
    change.current !== null &&
    !change.previous?.cancelledAt
  );
}

@Injectable()
export class ExamTermsImporter extends RecordImporter<SisExamTerm> {
  readonly domain = 'examTerms' as const;
  readonly capability: AcademicSystemCapability = 'examTerms.read';

  constructor(
    private readonly notifications: ExamTermNotificationsService,
    private readonly cancellations: ExamTermCancellationService,
  ) {
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
      (change) => this.applied(session, change),
    );
  }

  private async applied(session: SyncSession, change: AppliedChange<ExamTerm>): Promise<void> {
    const subject = change.current ?? change.previous;

    if (subject && becameCancelled(change)) {
      await this.cancellations.releaseSeats(subject.id, session.startedAt);
    }

    await this.notifications.applied(session.target, change, session.startedAt);
  }
}
