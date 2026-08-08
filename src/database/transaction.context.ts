import { AsyncLocalStorage } from 'node:async_hooks';

import { sql } from 'drizzle-orm';

import type { Database, Transaction } from './database.tokens';

export type IsolationLevel = 'read committed' | 'repeatable read' | 'serializable';

export interface TransactionOptions {
  isolationLevel?: IsolationLevel;
  readOnly?: boolean;
  deferrable?: boolean;
}

/**
 * Carries the in-flight transaction to every repository called beneath it, so
 * a service can compose repositories into one atomic unit without threading a
 * `tx` handle through signatures that have no other reason to know about it.
 *
 * AsyncLocalStorage rather than a request-scoped provider: request scope makes
 * Nest instantiate the whole dependency subtree per request, and it would not
 * cover work that starts outside a request at all — queue processors, cron.
 */
const storage = new AsyncLocalStorage<Transaction>();

/** The transaction enclosing the current async context, if any. */
export function currentTransaction(): Transaction | undefined {
  return storage.getStore();
}

/**
 * Runs `fn` inside a transaction. Nested calls join the transaction already in
 * flight instead of opening a second one — two concurrent transactions on
 * different connections would deadlock against each other's row locks.
 */
export async function runInTransaction<T>(
  db: Database,
  fn: (tx: Transaction) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  const ambient = storage.getStore();
  if (ambient) return fn(ambient);

  const config = {
    ...(options.isolationLevel ? { isolationLevel: options.isolationLevel } : {}),
    ...(options.deferrable === undefined ? {} : { deferrable: options.deferrable }),
  };

  return db.transaction(
    async (tx) => {
      if (options.readOnly) {
        await tx.execute(sql`set transaction read only`);
      }

      return storage.run(tx, () => fn(tx));
    },
    // An empty config still makes Drizzle emit a bare `set transaction`, which
    // Postgres rejects as a syntax error — pass nothing when there is nothing
    // to set.
    Object.keys(config).length > 0 ? config : undefined,
  );
}

/**
 * Escape hatch for work that must not join the caller's transaction — audit
 * rows that should survive a rollback, or a job enqueued only once the
 * surrounding write is durable.
 */
export function withoutTransaction<T>(fn: () => Promise<T>): Promise<T> {
  return storage.exit(fn);
}
