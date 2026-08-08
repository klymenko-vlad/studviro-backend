import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import type { TestProject } from 'vitest/node';

const run = promisify(execFile);

let postgres: StartedPostgreSqlContainer | undefined;
let redis: StartedTestContainer | undefined;

export async function setup(project: TestProject): Promise<void> {
  let databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    postgres = await new PostgreSqlContainer('postgres:17-alpine')
      .withDatabase('studviro_test')
      .withUsername('studviro')
      .withPassword('studviro')
      .withTmpFs({ '/var/lib/postgresql/data': 'rw' })
      .start();

    databaseUrl = postgres.getConnectionUri();
  }

  if (!process.env.REDIS_HOST) {
    redis = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
      .start();

    process.env.REDIS_HOST = redis.getHost();
    process.env.REDIS_PORT = String(redis.getMappedPort(6379));
  }

  await run('pnpm', ['exec', 'tsx', 'src/database/migrate.ts'], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });

  process.env.DATABASE_URL = databaseUrl;

  project.provide('databaseUrl', databaseUrl);
  project.provide('redisHost', process.env.REDIS_HOST);
  project.provide('redisPort', process.env.REDIS_PORT ?? '6379');
}

export async function teardown(): Promise<void> {
  await Promise.all([postgres?.stop({ remove: true }), redis?.stop({ remove: true })]);
}

declare module 'vitest' {
  interface ProvidedContext {
    databaseUrl: string;
    redisHost: string;
    redisPort: string;
  }
}
