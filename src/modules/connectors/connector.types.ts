export interface ConnectorRecord<TData> {
  readonly externalId: string;
  readonly sourceVersion: string;
  readonly sourceUpdatedAt: Date;
  readonly deleted: boolean;
  readonly data: TData;
}

export interface ConnectorQuery {
  readonly changedSince?: Date;
}

export interface ConnectorHealth {
  readonly reachable: boolean;
  readonly checkedAt: Date;
  readonly detail: string | null;
}

export type Capabilities<TCapability extends string> = Readonly<Record<TCapability, boolean>>;

export {
  CONNECTOR_KINDS,
  type ConnectorKind,
} from '../../database/schema/connector-credentials';

export interface ConnectorCredentialField {
  readonly key: string;
  readonly label: string;
  readonly description: string | null;
  readonly secret: boolean;
  readonly required: boolean;
}

export function changedSince<TData>(
  records: readonly ConnectorRecord<TData>[],
  query: ConnectorQuery = {},
): ConnectorRecord<TData>[] {
  const threshold = query.changedSince;

  return threshold === undefined
    ? [...records]
    : records.filter((record) => record.sourceUpdatedAt > threshold);
}
