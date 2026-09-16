import { Injectable } from '@nestjs/common';

import type { ConnectorQuery, ConnectorRecord } from '../../connectors/connector.types';
import type {
  LearningSystemCapability,
  LearningSystemConnector,
} from '../../connectors/learning-system.connector';
import type { LmsCompletion } from '../../connectors/learning-system.records';
import type { SyncSession } from '../sync-session';
import type { ApplyOutcome } from '../sync.types';

import { LearningRecordImporter } from './learning.importer';

@Injectable()
export class ActivityCompletionsImporter extends LearningRecordImporter<LmsCompletion> {
  readonly domain = 'activityCompletions' as const;
  readonly capability: LearningSystemCapability = 'completion.read';

  fetch(
    connector: LearningSystemConnector,
    query: ConnectorQuery,
  ): Promise<ConnectorRecord<LmsCompletion>[]> {
    return connector.getCompletion(query);
  }

  applyRecord(
    record: ConnectorRecord<LmsCompletion>,
    session: SyncSession,
  ): Promise<ApplyOutcome> {
    return session.apply('activityCompletions', record, async () => ({
      learningActivityId: await session.requireReference(
        'learningActivities',
        record.data.activityExternalId,
      ),
      userId: await session.requireUserFrom('sis', record.data.personExternalId),
      state: record.data.state,
      completedAt: record.data.completedAt,
    }));
  }
}
