import { pgEnum, timestamp } from 'drizzle-orm/pg-core';

/**
 * Millisecond precision, deliberately.
 *
 * Postgres stores `timestamptz` to the microsecond, but a JavaScript `Date`
 * only carries milliseconds — so a value read out of the database and sent back
 * in (a keyset pagination cursor, an idempotency check, an optimistic-locking
 * comparison) silently rounds down and no longer matches the row it came from.
 * Storing what the application can actually represent removes the whole class
 * of bug.
 *
 * Any column used as a keyset sort key should be declared the same way.
 */
const TIMESTAMP_PRECISION = 3;

export const timestampColumn = (name: string) =>
  timestamp(name, { withTimezone: true, precision: TIMESTAMP_PRECISION, mode: 'date' });

export const timestamps = {
  createdAt: timestampColumn('created_at').notNull().defaultNow(),
  updatedAt: timestampColumn('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** Soft-delete marker. Null means the row is live. */
export const deletedAt = timestampColumn('deleted_at');

/**
 * Where a stored file stands with the malware scanner (ADR 0042). `unscanned`
 * means scanning was off when it was uploaded; `pending` files are usable and
 * shown as not yet checked; an `infected` file's object has been deleted.
 */
export const FILE_SCAN_STATUSES = ['unscanned', 'pending', 'clean', 'infected'] as const;
export type FileScanStatus = (typeof FILE_SCAN_STATUSES)[number];
export const fileScanStatus = pgEnum('file_scan_status', FILE_SCAN_STATUSES);
export const scanStatusColumn = () =>
  fileScanStatus('scan_status').notNull().default('unscanned');
