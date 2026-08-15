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

export const CONNECTOR_KINDS = ['academic', 'learning'] as const;
export type ConnectorKind = (typeof CONNECTOR_KINDS)[number];

export function changedSince<TData>(
  records: readonly ConnectorRecord<TData>[],
  query: ConnectorQuery = {},
): ConnectorRecord<TData>[] {
  const threshold = query.changedSince;

  return threshold === undefined
    ? [...records]
    : records.filter((record) => record.sourceUpdatedAt > threshold);
}
