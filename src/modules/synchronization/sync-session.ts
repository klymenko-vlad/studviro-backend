import type { SQL } from 'drizzle-orm';

import type { SourceSystem } from '../../database/schema';
import type { ConnectorRecord } from '../connectors/connector.types';
import type { ExternalIdentitiesRepository } from '../identity/external-identities.repository';

import type { CanonicalRow, CanonicalTable, CanonicalTableName } from './canonical-tables';
import type { CanonicalRepositories } from './canonical.repositories';
import type { SourceValues } from './provenance.repository';
import type { AppliedChange, ApplyOutcome, SyncTarget } from './sync.types';

export class UnresolvedReferenceError extends Error {
  constructor(reference: string, externalId: string) {
    super(`No ${reference} is synchronized for external id "${externalId}"`);
    this.name = 'UnresolvedReferenceError';
  }
}

const USER_REFERENCE = 'user';

export class SyncSession {
  private readonly resolved = new Map<string, string | null>();

  constructor(
    readonly target: SyncTarget,
    private readonly repositories: CanonicalRepositories,
    private readonly identities: ExternalIdentitiesRepository,
    readonly startedAt: Date,
  ) {}

  async apply<TName extends CanonicalTableName>(
    table: TName,
    record: ConnectorRecord<unknown>,
    map: () => Promise<SourceValues<CanonicalTable<TName>>>,
    observe?: (change: AppliedChange<CanonicalRow<TName>>) => Promise<void>,
  ): Promise<ApplyOutcome> {
    const values = record.deleted ? ({} as SourceValues<CanonicalTable<TName>>) : await map();

    const applied = await this.repositories
      .of(table)
      .applyRecord(this.target, record, values, this.startedAt);

    this.resolved.set(this.key(table, record.externalId), record.deleted ? null : applied.id);

    await observe?.(applied as AppliedChange<CanonicalRow<TName>>);

    return applied.outcome;
  }

  prune(
    table: CanonicalTableName,
    scope: SQL,
    keepExternalIds: readonly string[],
  ): Promise<number> {
    return this.repositories.of(table).tombstoneMissing(this.target, scope, keepExternalIds);
  }

  async reference(table: CanonicalTableName, externalId: string): Promise<string | null> {
    const key = this.key(table, externalId);
    const cached = this.resolved.get(key);
    if (cached !== undefined) return cached;

    const found = await this.repositories.of(table).findIdByExternalId(this.target, externalId);
    this.resolved.set(key, found);

    return found;
  }

  /** A learning space names its offering by the SIS identifier, not its own. */
  async referenceIn(
    sourceSystem: SourceSystem,
    table: CanonicalTableName,
    externalId: string,
  ): Promise<string | null> {
    if (sourceSystem === this.target.sourceSystem) return this.reference(table, externalId);

    return this.repositories
      .of(table)
      .findIdByExternalId({ ...this.target, sourceSystem }, externalId);
  }

  async requireReference(table: CanonicalTableName, externalId: string): Promise<string> {
    const found = await this.reference(table, externalId);
    if (!found) throw new UnresolvedReferenceError(table, externalId);

    return found;
  }

  async user(externalId: string): Promise<string | null> {
    const key = this.key(USER_REFERENCE, externalId);
    const cached = this.resolved.get(key);
    if (cached !== undefined) return cached;

    const identity = await this.identities.findBySubject(
      this.target.institutionId,
      this.target.connectorName,
      externalId,
    );
    const found = identity?.userId ?? null;
    this.resolved.set(key, found);

    return found;
  }

  async requireUser(externalId: string): Promise<string> {
    const found = await this.user(externalId);
    if (!found) throw new UnresolvedReferenceError(USER_REFERENCE, externalId);

    return found;
  }

  rememberUser(externalId: string, userId: string | null): void {
    this.resolved.set(this.key(USER_REFERENCE, externalId), userId);
  }

  private key(reference: string, externalId: string): string {
    return `${reference}:${externalId}`;
  }
}
