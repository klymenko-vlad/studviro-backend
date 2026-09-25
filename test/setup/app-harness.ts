import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'drizzle-orm';

import { createApp } from '../../src/bootstrap';
import { PasswordService } from '../../src/common/crypto/password.service';
import { DRIZZLE, type Database } from '../../src/database/database.tokens';
import { users, type User, type UserRole } from '../../src/database/schema';
import { TokenService } from '../../src/modules/auth/token.service';

import { assertMatchesContract } from './openapi-contract';

export interface ActingUser {
  user: User;
  accessToken: string;
  headers: { authorization: string };
}

export interface TestHarness {
  app: NestFastifyApplication;
  db: Database;
  inject: NestFastifyApplication['inject'];
  truncateAll: () => Promise<void>;
  /**
   * Creates a user and mints a real access token for it. Tests go through the
   * genuine guard rather than stubbing it out, so a change that accidentally
   * exposes a route fails the suite instead of passing it.
   */
  actingAs: (overrides?: Partial<{ role: UserRole; email: string }>) => Promise<ActingUser>;
  close: () => Promise<void>;
}

let sequence = 0;

export async function createTestHarness(): Promise<TestHarness> {
  const app = await createApp();
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  const db = app.get<Database>(DRIZZLE);
  const tokens = app.get(TokenService);
  const passwords = app.get(PasswordService);

  const truncateAll = async (): Promise<void> => {
    const rows = await db.execute<{ tablename: string }>(sql`
      select tablename from pg_tables
      where schemaname = 'public' and tablename not like '__drizzle%'
    `);
    if (rows.length === 0) return;

    const list = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
    await db.execute(sql.raw(`truncate table ${list} restart identity cascade`));
  };

  const actingAs: TestHarness['actingAs'] = async (overrides = {}) => {
    sequence += 1;

    const [user] = await db
      .insert(users)
      .values({
        email: overrides.email ?? `actor-${sequence}@example.com`,
        displayName: `Actor ${sequence}`,
        passwordHash: await passwords.hash('correct horse battery staple'),
        role: overrides.role ?? 'user',
      })
      .returning();

    const { token } = await tokens.issueAccessToken(user!);

    return {
      user: user!,
      accessToken: token,
      headers: { authorization: `Bearer ${token}` },
    };
  };

  const inject = (async (options: { method?: string; url: string }) => {
    const response = await app.inject(options as never);
    assertMatchesContract(options.method ?? 'GET', options.url, response);

    return response;
  }) as unknown as TestHarness['inject'];

  return {
    app,
    db,
    inject,
    truncateAll,
    actingAs,
    close: () => app.close(),
  };
}
