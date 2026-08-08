import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  getTableName,
  inArray,
  isNotNull,
  isNull,
  sql,
  SQL,
} from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core/query-builders/update';

import {
  CursorPageDto,
  CursorPageMetaDto,
  type CursorPaginationQueryDto,
  PageDto,
  PageMetaDto,
  type PaginationQueryDto,
  type SortOrder,
} from '../../common/dto/pagination.dto';
import { EntityNotFoundError, InvalidInputError } from '../../common/errors/domain.error';
import type { Database, Transaction } from '../database.module';
import type { TransactionOptions } from '../transaction.context';
import { type TransactionHost } from '../transaction.host';

import { decodeCursor, encodeCursor } from './cursor';
import type {
  Entity,
  EntityId,
  FindManyOptions,
  FindOneOptions,
  InsertModel,
  ManagedTable,
  OrderByTerm,
  PaginateOptions,
  ReadOptions,
  UpdateModel,
  UpsertOptions,
} from './repository.types';

/**
 * Postgres caps a statement at 65535 bind parameters. A multi-row insert binds
 * one per column per row, so batches are split to stay under the ceiling
 * regardless of how wide the table is.
 */
const MAX_BIND_PARAMETERS = 65_000;

/**
 * Typed CRUD for any {@link ManagedTable}: soft-delete scoping, offset and
 * keyset pagination, row locking, batched inserts, ambient transactions, and
 * replica-routed reads.
 *
 * Two invariants hold for every subclass:
 *
 * - Reads and updates are scoped to `deleted_at IS NULL` unless `withDeleted`
 *   is passed, so forgetting a filter cannot resurrect a deleted row.
 * - Driver errors propagate untouched. `AllExceptionsFilter` maps them to
 *   status codes centrally, and a service that wants a field-specific message
 *   can branch on the helpers in `database-error.ts`.
 */
export abstract class BaseRepository<TTable extends ManagedTable> {
  /** Table name as it appears in error messages. */
  protected readonly entityName: string;

  /**
   * Columns a client may sort by, keyed by the name it passes as `sortBy`.
   * Anything outside this map is rejected, so the key never reaches SQL.
   */
  protected readonly sortable: Readonly<Record<string, PgColumn>> = {};

  /** Rows per batch for {@link createMany}, derived from the table width. */
  private readonly insertChunkSize: number;

  constructor(
    protected readonly txHost: TransactionHost,
    protected readonly table: TTable,
  ) {
    this.entityName = getTableName(table);
    const columnCount = Object.keys(getTableColumns(table)).length || 1;
    this.insertChunkSize = Math.max(1, Math.floor(MAX_BIND_PARAMETERS / columnCount));
  }

  // ---------------------------------------------------------------------------
  // Connections
  // ---------------------------------------------------------------------------

  /**
   * Drizzle's `from()` has a conditional return type it cannot resolve against
   * a generic parameter, so widen once here instead of casting at every call.
   */
  protected get selectable(): PgTable {
    return this.table;
  }

  /** The primary connection, ignoring any ambient transaction. */
  protected get db(): Database {
    return this.txHost.db;
  }

  /** Write client: explicit transaction, else the ambient one, else the pool. */
  protected client(tx?: Transaction): Database | Transaction {
    return this.txHost.client(tx);
  }

  /** Read client, routed to the replica when that is safe. */
  protected reader(tx?: Transaction, options: ReadOptions = {}): Database | Transaction {
    return this.txHost.reader(tx, options.consistent);
  }

  /**
   * Runs `fn` in a transaction shared by every repository call inside it, so
   * services do not have to thread a `tx` handle through their call graph.
   * Nested calls join the transaction already in flight.
   */
  transaction<T>(
    fn: (tx: Transaction) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T> {
    return this.txHost.run(fn, options);
  }

  // ---------------------------------------------------------------------------
  // Writes
  // ---------------------------------------------------------------------------

  async create(values: InsertModel<TTable>, tx?: Transaction): Promise<Entity<TTable>> {
    const [created] = await this.client(tx).insert(this.table).values(values).returning();

    // An INSERT with no ON CONFLICT clause either returns a row or throws.
    return created as Entity<TTable>;
  }

  /**
   * Inserts every row, splitting into batches that fit Postgres' bind-parameter
   * limit. Multi-batch inserts open a transaction so a failure half-way through
   * does not leave earlier batches committed.
   */
  async createMany(values: InsertModel<TTable>[], tx?: Transaction): Promise<Entity<TTable>[]> {
    if (values.length === 0) return [];
    if (values.length <= this.insertChunkSize) return this.insertBatch(values, tx);

    const ambient = tx ?? this.txHost.current;
    if (!ambient)
      return this.transaction((transaction) => this.createMany(values, transaction));

    const created: Entity<TTable>[] = [];
    for (let i = 0; i < values.length; i += this.insertChunkSize) {
      created.push(
        ...(await this.insertBatch(values.slice(i, i + this.insertChunkSize), ambient)),
      );
    }

    return created;
  }

  /**
   * Inserts, or updates the row that conflicts. Prefer this over
   * check-then-insert, which two concurrent requests can both pass.
   */
  async upsert(
    values: InsertModel<TTable>,
    options: UpsertOptions<TTable>,
    tx?: Transaction,
  ): Promise<Entity<TTable> | undefined> {
    const target = Array.isArray(options.target) ? options.target : [options.target];
    const set = options.set ?? this.defaultUpsertSet(values, target);

    const [row] = await this.client(tx)
      .insert(this.table)
      .values(values)
      .onConflictDoUpdate({
        target,
        targetWhere: options.targetWhere,
        set: this.setValues(set),
        setWhere: options.setWhere,
      })
      .returning();

    // Undefined only when `setWhere` filtered the update out — the caller asked
    // for a conditional write, so a no-op is a legitimate result, not an error.
    return row as Entity<TTable> | undefined;
  }

  /** Updates one live row by id. */
  async update(
    id: EntityId<TTable>,
    values: UpdateModel<TTable>,
    tx?: Transaction,
  ): Promise<Entity<TTable>> {
    const [updated] = await this.client(tx)
      .update(this.table)
      .set(this.setValues(values))
      .where(this.scope(eq(this.table.id, id)))
      .returning();

    if (!updated) throw this.notFound(id);

    return updated;
  }

  /** Updates every row matching `where` and returns the rows it touched. */
  async updateMany(
    where: SQL,
    values: UpdateModel<TTable>,
    options: ReadOptions = {},
    tx?: Transaction,
  ): Promise<Entity<TTable>[]> {
    const updated = await this.client(tx)
      .update(this.table)
      .set(this.setValues(values))
      .where(this.scope(where, options.withDeleted))
      .returning();

    return updated as Entity<TTable>[];
  }

  // ---------------------------------------------------------------------------
  // Deletes
  // ---------------------------------------------------------------------------

  async softDelete(id: EntityId<TTable>, tx?: Transaction): Promise<Entity<TTable>> {
    const [deleted] = await this.client(tx)
      .update(this.table)
      .set(this.setValues({ deletedAt: new Date() }))
      .where(this.scope(eq(this.table.id, id)))
      .returning();

    if (!deleted) throw this.notFound(id);

    return deleted;
  }

  /** Soft-deletes every matching live row; returns how many were affected. */
  async softDeleteMany(where: SQL, tx?: Transaction): Promise<number> {
    const deleted = await this.client(tx)
      .update(this.table)
      .set(this.setValues({ deletedAt: new Date() }))
      .where(this.scope(where))
      .returning({ id: this.table.id });

    return deleted.length;
  }

  async restore(id: EntityId<TTable>, tx?: Transaction): Promise<Entity<TTable>> {
    const [restored] = await this.client(tx)
      .update(this.table)
      .set(this.setValues({ deletedAt: null }))
      // Deliberately unscoped — the target row is soft-deleted by definition.
      // Requiring it to still be deleted keeps a double restore honest instead
      // of silently reporting success.
      .where(and(eq(this.table.id, id), isNotNull(this.table.deletedAt)))
      .returning();

    if (!restored) throw this.notFound(id);

    return restored;
  }

  async hardDelete(id: EntityId<TTable>, tx?: Transaction): Promise<void> {
    const [removed] = await this.client(tx)
      .delete(this.table)
      .where(eq(this.table.id, id))
      .returning({ id: this.table.id });

    if (!removed) throw this.notFound(id);
  }

  /** Permanently removes every matching row; returns how many were deleted. */
  async hardDeleteMany(where: SQL, tx?: Transaction): Promise<number> {
    const removed = await this.client(tx)
      .delete(this.table)
      .where(where)
      .returning({ id: this.table.id });

    return removed.length;
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  findById(
    id: EntityId<TTable>,
    options: FindOneOptions = {},
    tx?: Transaction,
  ): Promise<Entity<TTable> | undefined> {
    return this.findOne(eq(this.table.id, id), options, tx);
  }

  async findByIdOrFail(
    id: EntityId<TTable>,
    options: FindOneOptions = {},
    tx?: Transaction,
  ): Promise<Entity<TTable>> {
    const found = await this.findById(id, options, tx);
    if (!found) throw this.notFound(id);

    return found;
  }

  async findOne(
    where: SQL,
    options: FindOneOptions = {},
    tx?: Transaction,
  ): Promise<Entity<TTable> | undefined> {
    const [row] = await this.findMany({ ...options, where, limit: 1 }, tx);

    return row;
  }

  async findOneOrFail(
    where: SQL,
    options: FindOneOptions = {},
    tx?: Transaction,
  ): Promise<Entity<TTable>> {
    const found = await this.findOne(where, options, tx);
    if (!found) throw new EntityNotFoundError(this.entityName);

    return found;
  }

  /** Loads rows by id. Order follows `orderBy`, not the order of `ids`. */
  findByIds(
    ids: EntityId<TTable>[],
    options: FindManyOptions<TTable> = {},
    tx?: Transaction,
  ): Promise<Entity<TTable>[]> {
    if (ids.length === 0) return Promise.resolve([]);

    const byId = inArray(this.table.id, ids);

    return this.findMany(
      { ...options, where: options.where ? and(options.where, byId) : byId },
      tx,
    );
  }

  async findMany(
    options: FindManyOptions<TTable> = {},
    tx?: Transaction,
  ): Promise<Entity<TTable>[]> {
    let query = this.reader(tx, options)
      .select()
      .from(this.selectable)
      .where(this.scope(options.where, options.withDeleted))
      .orderBy(...this.resolveOrderBy(options.orderBy, options.order))
      .$dynamic();

    if (options.limit !== undefined) query = query.limit(options.limit);
    if (options.offset !== undefined) query = query.offset(options.offset);
    if (options.lock) {
      // Postgres rejects NOWAIT and SKIP LOCKED on the same clause, and Drizzle
      // models that as a union rather than two independent booleans — so pick
      // one instead of passing both keys as possibly-undefined.
      query = query.for(
        options.lock,
        options.noWait
          ? { noWait: true }
          : options.skipLocked
            ? { skipLocked: true }
            : undefined,
      );
    }

    return (await query) as Entity<TTable>[];
  }

  /**
   * Offset pagination with a total count — the right fit for page-numbered UIs.
   * For deep or infinite scrolling prefer {@link findByCursor}: `OFFSET` still
   * walks every skipped row, so page 5000 costs 5000 pages of work.
   */
  async findPaginated(
    query: PaginationQueryDto,
    options: PaginateOptions<TTable> = {},
    tx?: Transaction,
  ): Promise<PageDto<Entity<TTable>>> {
    const client = this.reader(tx, options);
    const where = this.scope(options.where, options.withDeleted);
    const orderBy = this.resolveOrderBy(
      options.orderBy ?? this.resolveSortColumn(query.sortBy),
      query.order,
    );

    const [rows, [totals]] = await Promise.all([
      client
        .select()
        .from(this.selectable)
        .where(where)
        .orderBy(...orderBy)
        .limit(query.limit)
        .offset(query.offset),
      client.select({ value: count() }).from(this.selectable).where(where),
    ]);

    return new PageDto(
      rows as Entity<TTable>[],
      new PageMetaDto(query.page, query.limit, totals?.value ?? 0),
    );
  }

  /**
   * Keyset pagination over `(sortColumn, id)`, defaulting to `createdAt`.
   *
   * The sort column must be non-nullable: a NULL has no position in the
   * row-value comparison that keeps this index-friendly, and rows would be
   * dropped from the sequence rather than sorted to one end.
   */
  async findByCursor(
    query: CursorPaginationQueryDto,
    options: PaginateOptions<TTable> & { sortColumn?: PgColumn } = {},
    tx?: Transaction,
  ): Promise<CursorPageDto<Entity<TTable>>> {
    const column = options.sortColumn ?? this.table.createdAt;
    const direction = query.order === 'asc' ? asc : desc;
    const filters = [
      this.scope(options.where, options.withDeleted),
      this.cursorFilter(query, column),
    ].filter((filter): filter is SQL => filter !== undefined);

    // One row beyond the page: its presence is what proves there is a next
    // page, without paying for a second count query.
    const rows = (await this.reader(tx, options)
      .select()
      .from(this.selectable)
      .where(and(...filters))
      .orderBy(direction(column), direction(this.table.id))
      .limit(query.limit + 1)) as Entity<TTable>[];

    const hasNextPage = rows.length > query.limit;
    const items = hasNextPage ? rows.slice(0, query.limit) : rows;
    const last = items.at(-1) as Record<string, unknown> | undefined;

    const nextCursor =
      hasNextPage && last
        ? encodeCursor({
            value: last[this.propertyOf(column)] as string | number | Date,
            id: String(last[this.propertyOf(this.table.id)]),
          })
        : null;

    return new CursorPageDto(
      items,
      new CursorPageMetaDto(query.limit, hasNextPage, nextCursor),
    );
  }

  async exists(where: SQL, options: ReadOptions = {}, tx?: Transaction): Promise<boolean> {
    // `count()` is an aggregate, so `limit(1)` would not stop it scanning every
    // matching row. Select a constant instead and let the limit do the work.
    const [row] = await this.reader(tx, options)
      .select({ value: sql<number>`1` })
      .from(this.selectable)
      .where(this.scope(where, options.withDeleted))
      .limit(1);

    return row !== undefined;
  }

  existsById(
    id: EntityId<TTable>,
    options: ReadOptions = {},
    tx?: Transaction,
  ): Promise<boolean> {
    return this.exists(eq(this.table.id, id), options, tx);
  }

  async count(where?: SQL, options: ReadOptions = {}, tx?: Transaction): Promise<number> {
    const [row] = await this.reader(tx, options)
      .select({ value: count() })
      .from(this.selectable)
      .where(this.scope(where, options.withDeleted));

    return row?.value ?? 0;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /** Adds the soft-delete predicate unless the caller opted out. */
  protected scope(where?: SQL, withDeleted = false): SQL | undefined {
    if (withDeleted) return where;

    const notDeleted = isNull(this.table.deletedAt);

    return where ? and(where, notDeleted) : notDeleted;
  }

  protected notFound(id: EntityId<TTable>): EntityNotFoundError {
    return new EntityNotFoundError(this.entityName, String(id));
  }

  private async insertBatch(
    values: InsertModel<TTable>[],
    tx?: Transaction,
  ): Promise<Entity<TTable>[]> {
    const created = await this.client(tx).insert(this.table).values(values).returning();

    return created;
  }

  /**
   * Drizzle types `set()` against a concrete table; against a generic parameter
   * it cannot prove the property names line up. `UpdateModel` has already
   * constrained the caller, so this cast only restates what the public
   * signature guarantees.
   */
  private setValues(
    values: UpdateModel<TTable> | { deletedAt: Date | null },
  ): PgUpdateSetSource<TTable> {
    return values as PgUpdateSetSource<TTable>;
  }

  /** Everything the caller supplied except the conflict key and audit columns. */
  private defaultUpsertSet(
    values: InsertModel<TTable>,
    target: PgColumn[],
  ): UpdateModel<TTable> {
    const excluded = new Set([
      'id',
      'createdAt',
      ...target.map((column) => this.propertyOf(column)),
    ]);
    const set: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(values as Record<string, unknown>)) {
      if (!excluded.has(key)) set[key] = value;
    }

    return set as UpdateModel<TTable>;
  }

  /**
   * Resolves ordering terms and appends `id` as a tiebreaker. That is not
   * cosmetic: ordering by a non-unique column alone lets Postgres return tied
   * rows in any order, so paging through equal timestamps can skip or repeat a
   * row.
   */
  private resolveOrderBy(
    orderBy: OrderByTerm<TTable> | OrderByTerm<TTable>[] | undefined,
    order: SortOrder = 'desc',
  ): SQL[] {
    const direction = order === 'asc' ? asc : desc;
    const terms = orderBy === undefined ? [this.table.createdAt] : [orderBy].flat();
    const resolved = terms.map((term) =>
      term instanceof SQL ? term : direction(term as PgColumn),
    );

    if (!terms.includes(this.table.id)) resolved.push(direction(this.table.id));

    return resolved;
  }

  /** Maps a client-supplied `sortBy` onto an allowlisted column. */
  private resolveSortColumn(sortBy: string | undefined): PgColumn | undefined {
    if (!sortBy) return undefined;

    const column = this.sortable[sortBy];
    if (!column) {
      throw new InvalidInputError('INVALID_SORT_FIELD', `Cannot sort by "${sortBy}"`, {
        sortBy,
        allowed: Object.keys(this.sortable),
      });
    }

    return column;
  }

  private cursorFilter(query: CursorPaginationQueryDto, column: PgColumn): SQL | undefined {
    if (!query.cursor) return undefined;

    const { value, id } = decodeCursor(query.cursor);

    // Postgres cannot infer a parameter's type from inside a row constructor,
    // so both sides are cast to the column's own SQL type. Without this the
    // driver sends them as text and the comparison fails outright.
    // Bound as text and cast in SQL: a bare Date reaches the driver without a
    // column encoder to serialise it.
    const literal = value instanceof Date ? value.toISOString() : value;
    const sortValue = sql`${literal}::${sql.raw(column.getSQLType())}`;
    const tiebreak = sql`${id}::${sql.raw(this.table.id.getSQLType())}`;

    // A row-value comparison keeps the predicate sargable, so a composite index
    // on (column, id) still serves the page in one range scan.
    return query.order === 'asc'
      ? sql`(${column}, ${this.table.id}) > (${sortValue}, ${tiebreak})`
      : sql`(${column}, ${this.table.id}) < (${sortValue}, ${tiebreak})`;
  }

  /** The TypeScript property a column is exposed under on the table. */
  private propertyOf(column: PgColumn): string {
    for (const [key, value] of Object.entries(getTableColumns(this.table))) {
      if (value === column) return key;
    }

    return column.name;
  }
}
