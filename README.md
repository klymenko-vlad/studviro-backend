# Studviro Backend

NestJS 11 on Fastify, Postgres via Drizzle, BullMQ on Redis, TypeScript strict.

## Quick start

```bash
cp .env.example .env
pnpm install
pnpm docker:up        # Postgres + Redis
pnpm db:migrate
pnpm start:dev
```

- API — http://localhost:3000/api/v1
- Swagger — http://localhost:3000/api/docs
- OpenAPI JSON — http://localhost:3000/api/docs/json
- Health — http://localhost:3000/health

## Layout

```
src/
  bootstrap.ts          app assembly (shared by main.ts and the e2e suite)
  main.ts               process entrypoint
  common/               filters, interceptors, shared DTOs, logger
  config/               env schema (zod) + AppConfigService
  database/             drizzle client, schema, migrations, BaseRepository
  health/               liveness / readiness / full probes
  modules/              feature modules (controller → service → repository)
  queue/                BullMQ producer, BaseProcessor, job schemas
test/
  e2e/                  full-app tests against real Postgres + Redis
  setup/                Testcontainers bootstrap and app harness
```

## Commands

| Command                       | Purpose                                  |
| ----------------------------- | ---------------------------------------- |
| `pnpm start:dev`              | Watch mode                               |
| `pnpm verify`                 | Everything CI runs, locally              |
| `pnpm test` / `pnpm test:cov` | Unit tests                               |
| `pnpm test:e2e`               | E2E tests (starts throwaway containers)  |
| `pnpm lint` / `pnpm format`   | ESLint / Prettier                        |
| `pnpm typecheck`              | `tsc --noEmit`                           |
| `pnpm db:generate`            | Generate a migration from schema changes |
| `pnpm db:migrate`             | Apply migrations                         |
| `pnpm db:studio`              | Drizzle Studio                           |
| `pnpm docker:reset`           | Wipe and recreate local services         |

## Conventions

**Adding an env var.** Declare it in `src/config/env.schema.ts`, expose it
through a group in `AppConfigService`, and add it to `.env.example`. The app
refuses to boot if a variable is missing or malformed, so a bad deploy fails at
startup instead of on the first request that needs it.

**Adding a feature.** A module is `controller → service → repository`. The
controller validates and shapes HTTP, the service holds domain rules, the
repository extends `BaseRepository` and holds queries. Modules export their
service, never their repository.

**Adding a queue job.** Add a zod schema to `src/queue/jobs/`, a handler entry
in the processor, and enqueue through `QueueProducer`. Payloads are validated at
enqueue and again at consume.

**Testing.** Logic that can be tested without I/O goes in a `.spec.ts` beside
the code with mocked collaborators. Anything crossing HTTP or the database goes
in `test/e2e`, which boots the real app via `createApp()` and drives it with
Fastify's `inject()`.

**Comments.** See [AGENTS.md](AGENTS.md) — prefer none.

## Deployment

`Dockerfile` produces a multi-stage, non-root image with a healthcheck. CI
builds and boots it on every PR; `release.yml` pushes multi-arch images to GHCR
with provenance and an SBOM after CI passes on `main`.

Run migrations before rolling out new instances:

```bash
node dist/database/migrate.js
```
