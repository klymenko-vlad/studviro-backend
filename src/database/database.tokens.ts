import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type * as schema from './schema';

/**
 * Injection tokens and connection types live apart from `DatabaseModule` so
 * that providers the module itself registers — `TransactionHost` — can import
 * them without forming an import cycle. A cycle here is not a lint nit: the
 * token would be `undefined` at decoration time and Nest would fail to resolve
 * the dependency at boot.
 */
export const DRIZZLE = Symbol('DRIZZLE');
export const DRIZZLE_RO = Symbol('DRIZZLE_RO');
export const PG_CLIENT = Symbol('PG_CLIENT');
export const PG_CLIENT_RO = Symbol('PG_CLIENT_RO');

export type Database = PostgresJsDatabase<typeof schema>;

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
