import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { AppConfigService } from '../config/app-config.service';

import { DRIZZLE, DRIZZLE_RO, PG_CLIENT, PG_CLIENT_RO } from './database.tokens';
import * as schema from './schema';
import { TransactionHost } from './transaction.host';

// Re-exported so existing imports of `database.module` keep working; the
// definitions live in `database.tokens` to keep this module importable from
// the providers it registers.
export {
  DRIZZLE,
  DRIZZLE_RO,
  PG_CLIENT,
  PG_CLIENT_RO,
  type Database,
  type Transaction,
} from './database.tokens';

function createClient(config: AppConfigService, url: string): postgres.Sql {
  return postgres(url, {
    max: config.database.poolMax,
    ssl: config.database.ssl ? 'require' : false,
    // Prepared statements break with transaction-mode poolers
    // (PgBouncer, Supabase, Neon).
    prepare: false,
    onnotice: () => undefined,
    connection: {
      // An unbounded query holds its pool slot forever, so a single slow
      // statement can starve every other request. The HTTP timeout alone does
      // not help: cancelling the response does not cancel the query.
      statement_timeout: config.database.statementTimeoutMs,
      idle_in_transaction_session_timeout: config.database.idleTransactionTimeoutMs,
    },
  });
}

@Global()
@Module({
  providers: [
    {
      provide: PG_CLIENT,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => createClient(config, config.database.url),
    },
    {
      // Aliased to the primary until a replica URL is configured. Repositories
      // route reads here from day one, so introducing a replica later is a
      // config change rather than a sweep through every repository.
      provide: PG_CLIENT_RO,
      inject: [AppConfigService, PG_CLIENT],
      useFactory: (config: AppConfigService, primary: postgres.Sql) =>
        config.database.replicaUrl ? createClient(config, config.database.replicaUrl) : primary,
    },
    {
      provide: DRIZZLE,
      inject: [PG_CLIENT],
      useFactory: (client: postgres.Sql) => drizzle(client, { schema, casing: 'snake_case' }),
    },
    {
      provide: DRIZZLE_RO,
      inject: [PG_CLIENT_RO],
      useFactory: (client: postgres.Sql) => drizzle(client, { schema, casing: 'snake_case' }),
    },
    TransactionHost,
  ],
  exports: [DRIZZLE, DRIZZLE_RO, PG_CLIENT, PG_CLIENT_RO, TransactionHost],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(
    @Inject(PG_CLIENT) private readonly client: postgres.Sql,
    @Inject(PG_CLIENT_RO) private readonly replica: postgres.Sql,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    const clients = this.replica === this.client ? [this.client] : [this.client, this.replica];

    await Promise.all(clients.map((client) => client.end({ timeout: 5 })));
  }
}
