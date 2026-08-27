import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { teachingAssignments } from '../../../database/schema';
import type {
  AcademicSystemCapability,
  AcademicSystemConnector,
} from '../../connectors/academic-system.connector';
import type {
  SisCourseOffering,
  SisTeachingAssignment,
} from '../../connectors/academic-system.records';
import type { ConnectorQuery, ConnectorRecord } from '../../connectors/connector.types';
import type { SyncSession } from '../sync-session';
import type { ApplyOutcome } from '../sync.types';

import { RecordImporter } from './academic.importer';

const teachingExternalId = (offeringExternalId: string, teaching: SisTeachingAssignment) =>
  `${offeringExternalId}:${teaching.personExternalId}:${teaching.role}`;

@Injectable()
export class CourseOfferingsImporter extends RecordImporter<SisCourseOffering> {
  readonly domain = 'courseOfferings' as const;
  readonly capability: AcademicSystemCapability = 'courseOfferings.read';

  fetch(
    connector: AcademicSystemConnector,
    query: ConnectorQuery,
  ): Promise<ConnectorRecord<SisCourseOffering>[]> {
    return connector.getCourseOfferings(query);
  }

  async applyRecord(
    record: ConnectorRecord<SisCourseOffering>,
    session: SyncSession,
  ): Promise<ApplyOutcome> {
    const outcome = await session.apply('courseOfferings', record, async () => ({
      courseId: await session.requireReference('courses', record.data.courseExternalId),
      academicTermId: await session.requireReference(
        'academicTerms',
        record.data.academicTermExternalId,
      ),
      orgUnitId: await session.reference('orgUnits', record.data.orgUnitExternalId),
      status: record.data.status,
      language: record.data.language,
      capacity: record.data.capacity,
    }));

    if (record.deleted) return outcome;

    await this.applyTeaching(record, session);

    return outcome;
  }

  private async applyTeaching(
    record: ConnectorRecord<SisCourseOffering>,
    session: SyncSession,
  ): Promise<void> {
    const courseOfferingId = await session.requireReference(
      'courseOfferings',
      record.externalId,
    );

    for (const teaching of record.data.teaching) {
      const externalId = teachingExternalId(record.externalId, teaching);

      await session.apply('teachingAssignments', { ...record, externalId }, async () => ({
        courseOfferingId,
        userId: await session.requireUser(teaching.personExternalId),
        role: teaching.role,
        isPrimary: teaching.isPrimary,
      }));
    }

    await session.prune(
      'teachingAssignments',
      eq(teachingAssignments.courseOfferingId, courseOfferingId),
      record.data.teaching.map((teaching) => teachingExternalId(record.externalId, teaching)),
    );
  }
}
