import { Injectable } from '@nestjs/common';

import type {
  AcademicSystemCapability,
  AcademicSystemConnector,
} from '../../connectors/academic-system.connector';
import type { SisTimetableEvent } from '../../connectors/academic-system.records';
import type { ConnectorQuery, ConnectorRecord } from '../../connectors/connector.types';
import type { SyncSession } from '../sync-session';
import type { ApplyOutcome } from '../sync.types';

import { RecordImporter } from './academic.importer';

@Injectable()
export class TimetableEventsImporter extends RecordImporter<SisTimetableEvent> {
  readonly domain = 'timetableEvents' as const;
  readonly capability: AcademicSystemCapability = 'timetableEvents.read';

  fetch(
    connector: AcademicSystemConnector,
    query: ConnectorQuery,
  ): Promise<ConnectorRecord<SisTimetableEvent>[]> {
    return connector.getTimetableEvents(query);
  }

  applyRecord(
    record: ConnectorRecord<SisTimetableEvent>,
    session: SyncSession,
  ): Promise<ApplyOutcome> {
    return session.apply('timetableEvents', record, async () => ({
      courseOfferingId: await session.requireReference(
        'courseOfferings',
        record.data.courseOfferingExternalId,
      ),
      studyGroupId: record.data.studyGroupExternalId
        ? await session.reference('studyGroups', record.data.studyGroupExternalId)
        : null,
      roomId: await session.reference('rooms', record.data.roomExternalId),
      type: record.data.type,
      title: record.data.title,
      startsAt: record.data.startsAt,
      endsAt: record.data.endsAt,
    }));
  }
}
