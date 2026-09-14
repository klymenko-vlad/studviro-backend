import { Injectable } from '@nestjs/common';

import type { ConnectorQuery, ConnectorRecord } from '../../connectors/connector.types';
import type {
  LearningSystemCapability,
  LearningSystemConnector,
} from '../../connectors/learning-system.connector';
import type { LmsCourse } from '../../connectors/learning-system.records';
import type { SyncSession } from '../sync-session';
import type { ApplyOutcome } from '../sync.types';

import { LearningRecordImporter } from './learning.importer';

@Injectable()
export class LearningSpacesImporter extends LearningRecordImporter<LmsCourse> {
  readonly domain = 'learningSpaces' as const;
  readonly capability: LearningSystemCapability = 'courses.read';

  fetch(
    connector: LearningSystemConnector,
    query: ConnectorQuery,
  ): Promise<ConnectorRecord<LmsCourse>[]> {
    return connector.getCourses(query);
  }

  applyRecord(record: ConnectorRecord<LmsCourse>, session: SyncSession): Promise<ApplyOutcome> {
    return session.apply('learningSpaces', record, async () => ({
      courseOfferingId: record.data.courseOfferingExternalId
        ? await session.referenceIn(
            'sis',
            'courseOfferings',
            record.data.courseOfferingExternalId,
          )
        : null,
      name: record.data.name,
      shortName: record.data.code,
      url: record.data.url,
      visible: record.data.visible,
    }));
  }
}
