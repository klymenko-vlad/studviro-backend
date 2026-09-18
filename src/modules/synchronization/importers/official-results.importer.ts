import { Injectable } from '@nestjs/common';

import type { OfficialCourseResult } from '../../../database/schema';
import type {
  AcademicSystemCapability,
  AcademicSystemConnector,
} from '../../connectors/academic-system.connector';
import type { SisOfficialResult } from '../../connectors/academic-system.records';
import type { ConnectorQuery, ConnectorRecord } from '../../connectors/connector.types';
import { GradeNotificationsService } from '../../notifications/grade-notifications.service';
import { GradeRecipientRepository } from '../grade-recipient.repository';
import type { SyncSession } from '../sync-session';
import type { ApplyOutcome, AppliedChange } from '../sync.types';

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

  constructor(
    private readonly notifications: GradeNotificationsService,
    private readonly enrollments: GradeRecipientRepository,
  ) {
    super();
  }

  applyRecord(
    record: ConnectorRecord<SisOfficialResult>,
    session: SyncSession,
  ): Promise<ApplyOutcome> {
    return session.apply(
      'officialCourseResults',
      record,
      async () => ({
        enrollmentId: await session.requireReference(
          'enrollments',
          record.data.enrollmentExternalId,
        ),
        status: 'official' as const,
        officialGrade: record.data.grade,
        officialRecordedAt: record.data.recordedAt,
      }),
      (change) => this.announce(session, change),
    );
  }

  private async announce(
    session: SyncSession,
    change: AppliedChange<OfficialCourseResult>,
  ): Promise<void> {
    const result = change.current;
    // A re-import that changes nothing is not news, and neither is a grade the
    // student has already been told about.
    if (!result || change.previous?.officialGrade === result.officialGrade) return;

    const owner = await this.enrollments.findOwner(result.enrollmentId);
    if (!owner) return;

    await this.notifications.published(
      session.target,
      {
        result,
        recipientId: owner.userId,
        courseOfferingId: owner.courseOfferingId,
        previousGrade: change.previous?.officialGrade ?? null,
      },
      session.startedAt,
    );
  }
}
