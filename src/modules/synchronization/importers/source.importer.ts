import type { SyncDomain } from '../../../database/schema';
import type { ConnectorQuery, ConnectorRecord } from '../../connectors/connector.types';
import type { SyncSession } from '../sync-session';
import type { ApplyOutcome } from '../sync.types';

export interface SourceImporter<TConnector, TCapability extends string> {
  readonly domain: SyncDomain;
  readonly capability: TCapability;

  fetch(connector: TConnector, query: ConnectorQuery): Promise<ConnectorRecord<unknown>[]>;

  apply(record: ConnectorRecord<unknown>, session: SyncSession): Promise<ApplyOutcome>;
}

export abstract class SourceRecordImporter<
  TConnector,
  TCapability extends string,
  TData,
> implements SourceImporter<TConnector, TCapability> {
  abstract readonly domain: SyncDomain;
  abstract readonly capability: TCapability;

  abstract fetch(
    connector: TConnector,
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
