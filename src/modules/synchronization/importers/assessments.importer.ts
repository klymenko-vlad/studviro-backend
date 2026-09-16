import { Injectable } from '@nestjs/common';

import type { ConnectorQuery, ConnectorRecord } from '../../connectors/connector.types';
import type {
  LearningSystemCapability,
  LearningSystemConnector,
} from '../../connectors/learning-system.connector';
import type { LmsAssessment } from '../../connectors/learning-system.records';
import type { SyncSession } from '../sync-session';
import type { ApplyOutcome } from '../sync.types';

import { LearningRecordImporter } from './learning.importer';

@Injectable()
export class AssessmentsImporter extends LearningRecordImporter<LmsAssessment> {
  readonly domain = 'assessments' as const;
  readonly capability: LearningSystemCapability = 'grades.read';

  fetch(
    connector: LearningSystemConnector,
    query: ConnectorQuery,
  ): Promise<ConnectorRecord<LmsAssessment>[]> {
    return connector.getAssessments(query);
  }

  applyRecord(
    record: ConnectorRecord<LmsAssessment>,
    session: SyncSession,
  ): Promise<ApplyOutcome> {
    return session.apply('assessments', record, async () => ({
      learningSpaceId: await session.requireReference(
        'learningSpaces',
        record.data.courseExternalId,
      ),
      learningActivityId: record.data.activityExternalId
        ? await session.reference('learningActivities', record.data.activityExternalId)
        : null,
      name: record.data.name,
      maxPoints: record.data.maxPoints === null ? null : String(record.data.maxPoints),
      weight: record.data.weight === null ? null : String(record.data.weight),
      countsTowardFinalGrade: record.data.countsTowardFinalGrade,
    }));
  }
}
