import type { SyncDomain } from '../../../database/schema';
import type {
  AcademicSystemCapability,
  AcademicSystemConnector,
} from '../../connectors/academic-system.connector';
import type { ConnectorQuery, ConnectorRecord } from '../../connectors/connector.types';
import type { SyncSession } from '../sync-session';
import type { ApplyOutcome } from '../sync.types';

export const ACADEMIC_IMPORTERS = Symbol('ACADEMIC_IMPORTERS');

export interface AcademicImporter {
  readonly domain: SyncDomain;
  readonly capability: AcademicSystemCapability;

  fetch(
    connector: AcademicSystemConnector,
    query: ConnectorQuery,
  ): Promise<ConnectorRecord<unknown>[]>;

  apply(record: ConnectorRecord<unknown>, session: SyncSession): Promise<ApplyOutcome>;
}

export abstract class RecordImporter<TData> implements AcademicImporter {
  abstract readonly domain: SyncDomain;
  abstract readonly capability: AcademicSystemCapability;

  abstract fetch(
    connector: AcademicSystemConnector,
    query: ConnectorQuery,
  ): Promise<ConnectorRecord<TData>[]>;

  abstract applyRecord(
    record: ConnectorRecord<TData>,
    session: SyncSession,
  ): Promise<ApplyOutcome>;

  apply(record: ConnectorRecord<unknown>, session: SyncSession): Promise<ApplyOutcome> {
    return this.applyRecord(record as ConnectorRecord<TData>, session);
  }
}
