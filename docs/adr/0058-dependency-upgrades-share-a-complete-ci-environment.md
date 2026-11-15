# 0058 — Dependency upgrades share a complete CI environment

Status: accepted
Date: 2026-11-15

## Context

Ten open Dependabot PRs update the backend together, including NestJS 12,
TypeScript 6 and Vitest 5. Checking each against the old dependency graph misses
compatibility between them. CI previously ran only for main, although work lands
on dev. Storage tests depended on a manually started MinIO and bucket which CI
never created. Both configured MinIO registries now refuse anonymous pulls.

## Decision

Combine the dependency updates in one PR into dev and regenerate the lockfile.
Update Fastify static and Prometheus integration to releases supporting the new
Nest stack, and refresh vulnerable production transitive dependencies.

TypeScript paths are relative to the config without the deprecated baseUrl.
The build explicitly sets rootDir to src to preserve dist/main.js. Regenerate the
OpenAPI document with Swagger 12, including the defaults and constraints it now emits.

Keep the existing typed repository boundary. The new typescript-eslint
no-generated-empty-object-type rule treats Drizzle's generic PgUpdateSetSource
as empty before a concrete table is supplied. Disable that rule only for
base.repository.ts; the strict TypeScript checks remain enabled.

Run CI for PRs and pushes on dev and main. Migration checks compare against the
actual PR base. E2E setup starts a digest-pinned RustFS S3 server through
Testcontainers and creates an isolated bucket before the app starts. Pass its
endpoint to test workers, and remove the container during teardown. An explicit
STORAGE_ENDPOINT keeps the option to use an existing store and bucket.

## Consequences

The S3 tests exercise real presigned requests, including rejection of a changed
signed content type. Coverage and E2E jobs need Docker but no manually started
services. PostgreSQL and Redis retain their existing Testcontainers lifecycle.
The development Docker Compose storage remains MinIO; its inaccessible image is
separate from the test environment.

The Redis throttler adapter 1.2.0 still declares peers only through NestJS 11;
there is no newer release. Keep it pending an upstream peer update and validate
its behavior through the real Redis E2E tests. Do not pretend its metadata claims
NestJS 12 support.

GitHub Actions currently refuses to start jobs because the owner's account is
locked for a billing issue. Local checks can verify the code; the account owner
must resolve billing before GitHub can run those same checks.
