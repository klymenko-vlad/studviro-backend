import { Injectable } from '@nestjs/common';

import type { ConnectorQuery, ConnectorRecord } from '../../connectors/connector.types';
import type {
  LearningSystemCapability,
  LearningSystemConnector,
} from '../../connectors/learning-system.connector';
import type { LmsActivity } from '../../connectors/learning-system.records';
import type { SyncSession } from '../sync-session';
import type { ApplyOutcome } from '../sync.types';

import { LearningRecordImporter } from './learning.importer';

@Injectable()
export class LearningActivitiesImporter extends LearningRecordImporter<LmsActivity> {
  readonly domain = 'learningActivities' as const;
  readonly capability: LearningSystemCapability = 'activities.read';

  fetch(
    connector: LearningSystemConnector,
    query: ConnectorQuery,
  ): Promise<ConnectorRecord<LmsActivity>[]> {
    return connector.getActivities(query);
  }

  applyRecord(
    record: ConnectorRecord<LmsActivity>,
    session: SyncSession,
  ): Promise<ApplyOutcome> {
    return session.apply('learningActivities', record, async () => ({
      learningSpaceId: await session.requireReference(
        'learningSpaces',
        record.data.courseExternalId,
      ),
      type: record.data.type,
      name: record.data.title,
      url: record.data.url,
      opensAt: record.data.opensAt,
      dueAt: record.data.dueAt,
    }));
  }
}
