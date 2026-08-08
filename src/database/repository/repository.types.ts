import type { InferInsertModel, InferSelectModel, SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';

/**
 * The contract every table managed by {@link BaseRepository} must satisfy:
 * a surrogate primary key, audit timestamps, and a soft-delete marker.
 *
 * Declaring the columns here (rather than `PgTable` alone) is what lets the
 * repository derive real types for ids and entities instead of falling back to
 * `any` at every call site.
 */
export interface ManagedTable extends PgTable {
  id: PgColumn;
  createdAt: PgColumn;
  updatedAt: PgColumn;
  deletedAt: PgColumn;
}

/** The row shape a `select` on the table produces. */
export type Entity<TTable extends ManagedTable> = InferSelectModel<TTable>;

/** The value shape an `insert` into the table accepts. */
export type InsertModel<TTable extends ManagedTable> = InferInsertModel<TTable>;

/** Columns the repository owns; callers set them through its methods, not directly. */
type ManagedColumn = 'id' | 'createdAt' | 'updatedAt' | 'deletedAt';

/**
 * The value shape an `update` accepts: every writable column, optional, and
 * open to a raw `SQL` expression so a caller can write `count + 1` without
 * reading the row first.
 *
 * Built as a key-remapped mapped type rather than `Omit`, which does not
 * distribute over Drizzle's inferred insert model and would silently reduce the
 * whole thing to an empty object.
 */
export type UpdateModel<TTable extends ManagedTable> = {
  [K in keyof InsertModel<TTable> as K extends ManagedColumn ? never : K]?:
    InsertModel<TTable>[K] | SQL;
};

/** The TypeScript type of the table's primary key, e.g. `string` for uuid. */
export type EntityId<TTable extends ManagedTable> = TTable['id']['_']['data'];

/** Any column of the table, keyed by its property name. */
export type ColumnOf<TTable extends ManagedTable> =
  TTable['_']['columns'][keyof TTable['_']['columns']];

export type SortDirection = 'asc' | 'desc';

/** One ordering term: a column of the table, or a raw SQL expression. */
export type OrderByTerm<TTable extends ManagedTable> = ColumnOf<TTable> | PgColumn | SQL;

export interface ReadOptions {
  /** Include soft-deleted rows. Defaults to `false`. */
  withDeleted?: boolean;
  /**
   * Read from the primary instead of the replica. Set it when the query must
   * observe a write this request just made — replication lag would otherwise
   * make a just-committed row look missing.
   */
  consistent?: boolean;
}

export interface LockOptions {
  /**
   * Take a row lock for the duration of the surrounding transaction.
   * `update` blocks concurrent writers; `share` blocks writers but not readers.
   */
  lock?: 'update' | 'share';
  /** Skip rows already locked instead of waiting — queue-drain semantics. */
  skipLocked?: boolean;
  /** Fail immediately instead of waiting for a contended row. */
  noWait?: boolean;
}

export interface FindOneOptions extends ReadOptions, LockOptions {}

export interface FindManyOptions<TTable extends ManagedTable> extends ReadOptions, LockOptions {
  where?: SQL;
  /** Ordering terms applied in sequence. Defaults to `createdAt`, then `id`. */
  orderBy?: OrderByTerm<TTable> | OrderByTerm<TTable>[];
  /** Direction applied to bare columns in `orderBy`. Defaults to `desc`. */
  order?: SortDirection;
  limit?: number;
  offset?: number;
}

/** Pagination owns limit, offset and direction, so callers cannot set them. */
export type PaginateOptions<TTable extends ManagedTable> = Omit<
  FindManyOptions<TTable>,
  'limit' | 'offset' | 'order'
>;

export interface UpsertOptions<TTable extends ManagedTable> {
  /** Conflict target: the unique column(s) or a partial-index predicate. */
  target: PgColumn | PgColumn[];
  /** Only applies the update when this predicate holds (`WHERE` on DO UPDATE). */
  targetWhere?: SQL;
  /**
   * Columns to overwrite on conflict. Defaults to every column present in the
   * inserted values except the conflict target and `createdAt`.
   */
  set?: UpdateModel<TTable>;
  setWhere?: SQL;
}
