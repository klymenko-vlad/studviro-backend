import { eq, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

import type { Transaction } from '../database.tokens';

import { BaseRepository } from './base.repository';
import type {
  Entity,
  EntityId,
  FindManyOptions,
  FindOneOptions,
  ManagedTable,
  ReadOptions,
} from './repository.types';

export interface InstitutionScopedTable extends ManagedTable {
  institutionId: PgColumn;
}

export abstract class InstitutionScopedRepository<
  TTable extends InstitutionScopedTable,
> extends BaseRepository<TTable> {
  protected withinInstitution(institutionId: string, where?: SQL): SQL {
    const belongs = eq(this.table.institutionId, institutionId);

    return where ? sql`${belongs} and ${where}` : belongs;
  }

  findByIdIn(
    institutionId: string,
    id: EntityId<TTable>,
    options: FindOneOptions = {},
    tx?: Transaction,
  ): Promise<Entity<TTable> | undefined> {
    return this.findOne(
      this.withinInstitution(institutionId, eq(this.table.id, id)),
      options,
      tx,
    );
  }

  async findByIdInOrFail(
    institutionId: string,
    id: EntityId<TTable>,
    options: FindOneOptions = {},
    tx?: Transaction,
  ): Promise<Entity<TTable>> {
    const found = await this.findByIdIn(institutionId, id, options, tx);
    if (!found) throw this.notFound(id);

    return found;
  }

  findOneIn(
    institutionId: string,
    where?: SQL,
    options: FindOneOptions = {},
    tx?: Transaction,
  ): Promise<Entity<TTable> | undefined> {
    return this.findOne(this.withinInstitution(institutionId, where), options, tx);
  }

  findManyIn(
    institutionId: string,
    options: FindManyOptions<TTable> = {},
    tx?: Transaction,
  ): Promise<Entity<TTable>[]> {
    return this.findMany(
      { ...options, where: this.withinInstitution(institutionId, options.where) },
      tx,
    );
  }

  existsIn(
    institutionId: string,
    where?: SQL,
    options: ReadOptions = {},
    tx?: Transaction,
  ): Promise<boolean> {
    return this.exists(this.withinInstitution(institutionId, where), options, tx);
  }

  countIn(
    institutionId: string,
    where?: SQL,
    options: ReadOptions = {},
    tx?: Transaction,
  ): Promise<number> {
    return this.count(this.withinInstitution(institutionId, where), options, tx);
  }
}
