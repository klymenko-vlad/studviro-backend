import { Injectable } from '@nestjs/common';

import type { ConnectorQuery, ConnectorRecord } from '../../connectors/connector.types';
import type {
  LearningSystemCapability,
  LearningSystemConnector,
} from '../../connectors/learning-system.connector';
import type { LmsSubmission } from '../../connectors/learning-system.records';
import type { SyncSession } from '../sync-session';
import type { ApplyOutcome } from '../sync.types';

import { LearningRecordImporter } from './learning.importer';

@Injectable()
export class SubmissionRefsImporter extends LearningRecordImporter<LmsSubmission> {
  readonly domain = 'submissions' as const;
  readonly capability: LearningSystemCapability = 'submissions.read';

  fetch(
    connector: LearningSystemConnector,
    query: ConnectorQuery,
  ): Promise<ConnectorRecord<LmsSubmission>[]> {
    return connector.getSubmissions(query);
  }

  applyRecord(
    record: ConnectorRecord<LmsSubmission>,
    session: SyncSession,
  ): Promise<ApplyOutcome> {
    return session.apply('submissionRefs', record, async () => ({
      learningActivityId: await session.requireReference(
        'learningActivities',
        record.data.activityExternalId,
      ),
      userId: await session.requireUserFrom('sis', record.data.personExternalId),
      state: record.data.state,
      attempt: record.data.attempt,
      submittedAt: record.data.submittedAt,
      isLate: record.data.isLate,
      url: record.data.url,
      fileCount: record.data.fileCount,
    }));
  }
}
