import { sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

import { sourceWriteIntents } from '../../database/schema';

/**
 * Rows the platform is still delivering a write for. An import that no longer
 * offers such a row must not tombstone or prune it: the source has not seen the
 * write yet, and deleting the row for that reason would erase the act the
 * student is waiting on (ADR 0023).
 */
export function hasLiveWriteIntent(institutionId: PgColumn, id: PgColumn): SQL {
  return sql`exists (
    select 1 from ${sourceWriteIntents}
    where ${sourceWriteIntents.institutionId} = ${institutionId}
      and ${sourceWriteIntents.canonicalId} = ${id}
      and ${sourceWriteIntents.state} in ('pending', 'in_flight')
      and ${sourceWriteIntents.deletedAt} is null
  )`;
}
