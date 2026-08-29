import { and, eq, notInArray, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

import {
  InstitutionScopedRepository,
  type InstitutionScopedTable,
} from '../../database/repository/institution-scoped.repository';
import type { Entity, InsertModel } from '../../database/repository/repository.types';
import type { ConnectorRecord } from '../connectors/connector.types';

import type { AppliedChange, SyncTarget } from './sync.types';

export interface ProvenancedTable extends InstitutionScopedTable {
  sourceSystem: PgColumn;
  externalId: PgColumn;
  sourceVersion: PgColumn;
  sourceUpdatedAt: PgColumn;
  lastSynchronizedAt: PgColumn;
  synchronizationStatus: PgColumn;
}

type ProvenanceKey =
  | 'institutionId'
  | 'sourceSystem'
  | 'externalId'
  | 'sourceVersion'
  | 'sourceUpdatedAt'
  | 'lastSynchronizedAt'
  | 'synchronizationStatus';

export type SourceValues<TTable extends ProvenancedTable> = {
  [
    K in keyof InsertModel<TTable> as K extends ProvenanceKey ? never : K
  ]: InsertModel<TTable>[K];
};

export interface AppliedRecord<TRow> extends AppliedChange<TRow> {
  readonly id: string | null;
}

export class ProvenanceRepository<
  TTable extends ProvenancedTable,
> extends InstitutionScopedRepository<TTable> {
  async findIdByExternalId(target: SyncTarget, externalId: string): Promise<string | null> {
    const found = await this.findByExternalId(target, externalId);

    return found ? (found as { id: string }).id : null;
  }

  async findByExternalId(
    target: SyncTarget,
    externalId: string,
  ): Promise<Entity<TTable> | undefined> {
    return this.findOneIn(
      target.institutionId,
      and(
        eq(this.table.sourceSystem, target.sourceSystem),
        eq(this.table.externalId, externalId),
      ),
      { consistent: true },
    );
  }

  tombstoneMissing(
    target: SyncTarget,
    scope: SQL,
    keepExternalIds: readonly string[],
  ): Promise<number> {
    const conditions = [eq(this.table.sourceSystem, target.sourceSystem), scope];
    if (keepExternalIds.length > 0) {
      conditions.push(notInArray(this.table.externalId, [...keepExternalIds]));
    }

    return this.softDeleteMany(
      this.withinInstitution(target.institutionId, and(...conditions)),
    );
  }

  async applyRecord(
    target: SyncTarget,
    record: ConnectorRecord<unknown>,
    values: SourceValues<TTable>,
    now: Date,
  ): Promise<AppliedRecord<Entity<TTable>>> {
    const previous = (await this.findByExternalId(target, record.externalId)) ?? null;
    const existingId = previous ? (previous as { id: string }).id : null;

    if (record.deleted) {
      if (!existingId) return { id: null, outcome: 'skipped', previous: null, current: null };
      const removed = await this.softDelete(existingId);

      return { id: existingId, outcome: 'deleted', previous, current: removed };
    }

    const written = await this.upsert(
      {
        ...(values as object),
        institutionId: target.institutionId,
        sourceSystem: target.sourceSystem,
        externalId: record.externalId,
        sourceVersion: record.sourceVersion,
        sourceUpdatedAt: record.sourceUpdatedAt,
        lastSynchronizedAt: now,
        synchronizationStatus: 'in_sync',
      } as InsertModel<TTable>,
      {
        target: [this.table.institutionId, this.table.sourceSystem, this.table.externalId],
        targetWhere: sql`${this.table.externalId} is not null and ${this.table.deletedAt} is null`,
        setWhere: sql`${this.table.sourceUpdatedAt} is null or ${this.table.sourceUpdatedAt} <= excluded.source_updated_at`,
      },
    );

    if (!written) return { id: existingId, outcome: 'skipped', previous, current: null };

    return {
      id: (written as { id: string }).id,
      outcome: existingId ? 'updated' : 'created',
      previous,
      current: written,
    };
  }
}
