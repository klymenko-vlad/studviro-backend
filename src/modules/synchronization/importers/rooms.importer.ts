import { Injectable } from '@nestjs/common';

import type {
  AcademicSystemCapability,
  AcademicSystemConnector,
} from '../../connectors/academic-system.connector';
import type { SisRoom } from '../../connectors/academic-system.records';
import type { ConnectorQuery, ConnectorRecord } from '../../connectors/connector.types';
import type { SyncSession } from '../sync-session';
import type { ApplyOutcome } from '../sync.types';

import { RecordImporter } from './academic.importer';

@Injectable()
export class RoomsImporter extends RecordImporter<SisRoom> {
  readonly domain = 'rooms' as const;
  readonly capability: AcademicSystemCapability = 'rooms.read';

  fetch(
    connector: AcademicSystemConnector,
    query: ConnectorQuery,
  ): Promise<ConnectorRecord<SisRoom>[]> {
    return connector.getRooms(query);
  }

  applyRecord(record: ConnectorRecord<SisRoom>, session: SyncSession): Promise<ApplyOutcome> {
    return session.apply('rooms', record, async () => ({
      orgUnitId: await session.reference('orgUnits', record.data.orgUnitExternalId),
      code: record.data.code,
      building: record.data.building,
      capacity: record.data.capacity,
    }));
  }
}
