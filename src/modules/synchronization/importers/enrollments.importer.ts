import { Injectable } from '@nestjs/common';

import type {
  AcademicSystemCapability,
  AcademicSystemConnector,
} from '../../connectors/academic-system.connector';
import type { SisEnrollment } from '../../connectors/academic-system.records';
import type { ConnectorQuery, ConnectorRecord } from '../../connectors/connector.types';
import { EnrollmentNotificationsService } from '../../notifications/enrollment-notifications.service';
import type { SyncSession } from '../sync-session';
import type { ApplyOutcome } from '../sync.types';

import { RecordImporter } from './academic.importer';

@Injectable()
export class EnrollmentsImporter extends RecordImporter<SisEnrollment> {
  readonly domain = 'enrollments' as const;
  readonly capability: AcademicSystemCapability = 'enrollments.read';

  fetch(
    connector: AcademicSystemConnector,
    query: ConnectorQuery,
  ): Promise<ConnectorRecord<SisEnrollment>[]> {
    return connector.getEnrollments(query);
  }

  constructor(private readonly notifications: EnrollmentNotificationsService) {
    super();
  }

  applyRecord(
    record: ConnectorRecord<SisEnrollment>,
    session: SyncSession,
  ): Promise<ApplyOutcome> {
    return session.apply(
      'enrollments',
      record,
      async () => ({
        courseOfferingId: await session.requireReference(
          'courseOfferings',
          record.data.courseOfferingExternalId,
        ),
        userId: await session.requireUser(record.data.personExternalId),
        programId: await session.reference('programs', record.data.programExternalId),
        status: record.data.status,
        requirementType: record.data.requirementType,
        attempt: record.data.attempt,
        enrolledAt: record.data.enrolledAt,
      }),
      (change) => this.notifications.applied(session.target, change, session.startedAt),
    );
  }
}
