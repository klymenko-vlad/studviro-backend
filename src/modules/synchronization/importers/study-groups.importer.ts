import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { studyGroupMemberships } from '../../../database/schema';
import type {
  AcademicSystemCapability,
  AcademicSystemConnector,
} from '../../connectors/academic-system.connector';
import type { SisStudyGroup } from '../../connectors/academic-system.records';
import type { ConnectorQuery, ConnectorRecord } from '../../connectors/connector.types';
import type { SyncSession } from '../sync-session';
import type { ApplyOutcome } from '../sync.types';

import { RecordImporter } from './academic.importer';

const membershipExternalId = (groupExternalId: string, memberExternalId: string) =>
  `${groupExternalId}:${memberExternalId}`;

@Injectable()
export class StudyGroupsImporter extends RecordImporter<SisStudyGroup> {
  readonly domain = 'studyGroups' as const;
  readonly capability: AcademicSystemCapability = 'studyGroups.read';

  fetch(
    connector: AcademicSystemConnector,
    query: ConnectorQuery,
  ): Promise<ConnectorRecord<SisStudyGroup>[]> {
    return connector.getStudyGroups(query);
  }

  async applyRecord(
    record: ConnectorRecord<SisStudyGroup>,
    session: SyncSession,
  ): Promise<ApplyOutcome> {
    const outcome = await session.apply('studyGroups', record, async () => ({
      courseOfferingId: await session.requireReference(
        'courseOfferings',
        record.data.courseOfferingExternalId,
      ),
      kind: record.data.kind,
      code: record.data.code,
      capacity: record.data.capacity,
    }));

    if (record.deleted) return outcome;

    await this.applyMembers(record, session);

    return outcome;
  }

  private async applyMembers(
    record: ConnectorRecord<SisStudyGroup>,
    session: SyncSession,
  ): Promise<void> {
    const studyGroupId = await session.requireReference('studyGroups', record.externalId);

    for (const memberExternalId of record.data.memberExternalIds) {
      const externalId = membershipExternalId(record.externalId, memberExternalId);

      await session.apply('studyGroupMemberships', { ...record, externalId }, async () => ({
        studyGroupId,
        userId: await session.requireUser(memberExternalId),
      }));
    }

    await session.prune(
      'studyGroupMemberships',
      eq(studyGroupMemberships.studyGroupId, studyGroupId),
      record.data.memberExternalIds.map((member) =>
        membershipExternalId(record.externalId, member),
      ),
    );
  }
}
