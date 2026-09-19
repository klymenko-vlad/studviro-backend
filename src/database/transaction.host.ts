import { Inject, Injectable } from '@nestjs/common';

import { type Database, DRIZZLE, DRIZZLE_RO, type Transaction } from './database.tokens';
import {
  retryOnSerializationFailure,
  type SerializableRetryOptions,
} from './serializable-retry';
import {
  currentTransaction,
  runInTransaction,
  type TransactionOptions,
} from './transaction.context';

/**
 * The connection every repository resolves its queries through.
 *
 * Centralising the choice is what keeps two concerns out of the repositories
 * themselves: joining an ambient transaction, and routing reads to a replica.
 * Both decisions depend on the surrounding async context rather than on the
 * query, so a repository has no business making them.
 *
 * Services use it directly to make several repositories atomic:
 *
 * ```ts
 * await this.tx.run(async () => {
 *   const order = await this.orders.create(dto);
 *   await this.ledger.create({ orderId: order.id, amount: order.total });
 * });
 * ```
 */
@Injectable()
export class TransactionHost {
  constructor(
    @Inject(DRIZZLE) private readonly primary: Database,
    @Inject(DRIZZLE_RO) private readonly readOnly: Database,
  ) {}

  /** The primary connection, ignoring any ambient transaction. */
  get db(): Database {
    return this.primary;
  }

  /** The transaction in flight on this async context, if any. */
  get current(): Transaction | undefined {
    return currentTransaction();
  }

  get isActive(): boolean {
    return currentTransaction() !== undefined;
  }

  /** Write client: explicit transaction, else the ambient one, else the pool. */
  client(tx?: Transaction): Database | Transaction {
    return tx ?? currentTransaction() ?? this.primary;
  }

  /**
   * Read client. The replica is used only outside a transaction and only when
   * the caller has not demanded read-your-writes consistency — a transaction
   * must read its own uncommitted rows, and replication lag would otherwise
   * make a just-committed row look missing.
   */
  reader(tx?: Transaction, consistent = false): Database | Transaction {
    const ambient = tx ?? currentTransaction();
    if (ambient) return ambient;

    return consistent ? this.primary : this.readOnly;
  }

  /**
   * Runs the callback in a transaction that every repository call inside it
   * joins, so no `tx` handle has to be threaded through the call graph.
   */
  run<T>(fn: (tx: Transaction) => Promise<T>, options?: TransactionOptions): Promise<T> {
    return runInTransaction(this.primary, fn, options);
  }

  /**
   * A serialisable transaction that replays itself when it loses a race.
   *
   * `serializable` is what makes a capacity check honest — the seat count is
   * read and written inside the transaction, so a conflicting pair cannot both
   * commit. The cost is that under a herd a large share of callers are told to
   * retry, and without this they are told that instead of being served.
   *
   * A replay re-reads: the attempt that finds the course full now gets a
   * correct `OFFERING_FULL` rather than a conflict. `fn` must therefore be safe
   * to run more than once, which it is — the rolled-back attempt left nothing.
   *
   * Joined transactions are not retried: the outer transaction is already
   * doomed, so replaying only the inner part would commit nothing.
   */
  runSerializable<T>(
    fn: (tx: Transaction) => Promise<T>,
    retry?: SerializableRetryOptions,
  ): Promise<T> {
    const attempt = (): Promise<T> =>
      runInTransaction(this.primary, fn, { isolationLevel: 'serializable' });

    return this.isActive ? attempt() : retryOnSerializationFailure(attempt, retry);
  }
}

export type { TransactionOptions };
