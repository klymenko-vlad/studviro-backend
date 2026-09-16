import { Injectable } from '@nestjs/common';

import type { ConnectorQuery, ConnectorRecord } from '../../connectors/connector.types';
import type {
  LearningSystemCapability,
  LearningSystemConnector,
} from '../../connectors/learning-system.connector';
import type { LmsGrade } from '../../connectors/learning-system.records';
import type { SyncSession } from '../sync-session';
import type { ApplyOutcome } from '../sync.types';

import { LearningRecordImporter } from './learning.importer';

const SCORE_PRECISION = 4;

@Injectable()
export class AssessmentResultsImporter extends LearningRecordImporter<LmsGrade> {
  readonly domain = 'assessmentResults' as const;
  readonly capability: LearningSystemCapability = 'grades.read';

  fetch(
    connector: LearningSystemConnector,
    query: ConnectorQuery,
  ): Promise<ConnectorRecord<LmsGrade>[]> {
    return connector.getGrades(query);
  }

  applyRecord(record: ConnectorRecord<LmsGrade>, session: SyncSession): Promise<ApplyOutcome> {
    return session.apply('assessmentResults', record, async () => ({
      assessmentId: await session.requireReference(
        'assessments',
        record.data.assessmentExternalId,
      ),
      userId: await session.requireUserFrom('sis', record.data.personExternalId),
      points: record.data.points === null ? null : String(record.data.points),
      normalizedScore: normalized(record.data.points, record.data.maxPoints),
      feedback: record.data.feedback,
      gradedAt: record.data.gradedAt,
    }));
  }
}

/** The LMS reports points; the share of the maximum is what a screen can compare. */
export function normalized(points: number | null, maxPoints: number | null): string | null {
  if (points === null || maxPoints === null || maxPoints <= 0) return null;

  return (points / maxPoints).toFixed(SCORE_PRECISION);
}
