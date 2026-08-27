import { Injectable } from '@nestjs/common';

import type {
  AcademicSystemCapability,
  AcademicSystemConnector,
} from '../../connectors/academic-system.connector';
import type { SisOrgUnit } from '../../connectors/academic-system.records';
import type { ConnectorQuery, ConnectorRecord } from '../../connectors/connector.types';
import type { SyncSession } from '../sync-session';
import type { ApplyOutcome } from '../sync.types';

import { RecordImporter } from './academic.importer';

@Injectable()
export class OrgUnitsImporter extends RecordImporter<SisOrgUnit> {
  readonly domain = 'orgUnits' as const;
  readonly capability: AcademicSystemCapability = 'orgUnits.read';

  fetch(
    connector: AcademicSystemConnector,
    query: ConnectorQuery,
  ): Promise<ConnectorRecord<SisOrgUnit>[]> {
    return connector.getOrgUnits(query);
  }

  applyRecord(
    record: ConnectorRecord<SisOrgUnit>,
    session: SyncSession,
  ): Promise<ApplyOutcome> {
    return session.apply('orgUnits', record, async () => ({
      parentId: record.data.parentExternalId
        ? await session.reference('orgUnits', record.data.parentExternalId)
        : null,
      type: record.data.type,
      code: record.data.code,
      name: record.data.name,
    }));
  }
}
