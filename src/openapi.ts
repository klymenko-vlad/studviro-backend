/**
 * Emits `openapi.json` from the live controller metadata, without listening on a
 * port. Run via `pnpm openapi:generate`.
 *
 * Generating from code rather than scraping a running `/api/docs/json` is what
 * lets CI (and the frontend's codegen) produce the spec with no database, no
 * Redis and no deployed environment — and it is what makes the committed
 * `openapi.json` a contract we can diff on every pull request.
 *
 * Runs against the compiled output (`dist/`) rather than through tsx: esbuild
 * does not emit `design:paramtypes`, and without that metadata Nest cannot
 * resolve a single constructor injection.
 */

// Must stay the first import: it seeds the environment that AppModule validates
// at import time.
import './openapi.env';

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';

import { AppModule } from './app.module';
import { buildOpenApiDocument } from './openapi.document';

async function generate(): Promise<void> {
  // `logger: false` is deliberately not used — providers inject `PinoLogger`,
  // which Nest then declines to resolve. `LOG_LEVEL=silent` keeps output clean.
  const app = await NestFactory.create(AppModule, new FastifyAdapter(), {
    bufferLogs: true,
    abortOnError: false,
  });

  // Prefix and versioning must match `bootstrap.ts`, or the generated client
  // would call paths that do not exist.
  app.setGlobalPrefix(process.env.API_PREFIX ?? 'api', {
    exclude: ['health', 'health/live', 'health/ready'],
  });

  const document = buildOpenApiDocument(app);
  const target = join(process.cwd(), 'openapi.json');

  // Trailing newline keeps the file POSIX-clean so `git diff --exit-code` in CI
  // does not trip over a missing EOL.
  writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`);

  await app.close();

  console.log(`openapi.json written (${Object.keys(document.paths).length} paths)`);
  // BullMQ/ioredis keep handles open past `app.close()`; the document is already
  // on disk, so exiting explicitly is safe and keeps CI from hanging.
  process.exit(0);
}

generate().catch((error: unknown) => {
  console.error('failed to generate openapi.json', error);
  process.exit(1);
});
