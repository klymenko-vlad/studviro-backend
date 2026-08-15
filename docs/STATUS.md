# Status

Handoff note for the next agent. Keep it under ~100 lines; trim rather than append.

Last updated: 2026-08-15

## What this is

A unified academic platform integrating a Student Information System (AIS2) and an LMS
(Moodle) behind one canonical model, so neither is hard-coded into the core. Full reasoning
in `docs/System Plan.md`; the 71-step backlog is in `docs/Tasks Plan.md` and its live status,
plus the working agreement for backlog work, in `docs/Task Tracker.md`.

## Stack

NestJS 11 on Fastify · Drizzle ORM + PostgreSQL 17 · Redis 7 (cache, BullMQ, throttle, locks)
· class-validator DTOs, Zod for env · generated `openapi.json` · Vitest + Testcontainers.
Client is Next.js 16 App Router (Feature-Sliced Design) and acts as the BFF, converting
platform tokens into httpOnly cookies. Decisions live in `docs/adr/`.

## Done

- **App skeleton** — modular monolith (ADR 0002), `ROLE=api|worker|all`, Zod-validated env,
  graceful shutdown, request timeouts, Helmet/CORS/compression/body limits.
- **Persistence** — drizzle-kit migrations, `TransactionHost`-mediated repositories, keyset
  pagination (ADR 0004), soft-delete and ms-precision timestamps in `schema/_shared.ts`.
- **Auth** — local credentials: argon2, 15-min access JWT carrying `token_version`, opaque
  refresh token stored as SHA-256 and rotated on use, with reuse detection (ADR 0003).
- **Async plumbing** — BullMQ with a shared `BaseProcessor`, Redis lock, `Idempotency-Key`.
- **Operations** — Pino logs with correlation IDs, Terminus health, bearer-protected
  Prometheus metrics, multi-stage `Dockerfile`, `docker-compose.yml`.
- **Canonical academic schema** (step 25) — 25 tables (ADR 0009). External IDs are never
  primary keys: every row carries `institution_id` plus provenance (`source_system`,
  `external_id`, `source_version`, `source_updated_at`, `last_synchronized_at`,
  `synchronization_status`), unique per `(institution_id, source_system, external_id)`.
  Grades are split into calculated / proposed / official.
- **Role and identity API** — institution-scoped `role-assignments` routes (`role:read`,
  `role:assign`), `users/me/roles`, `users/me/identities`, the caller's institutions, and
  `institutions/:id/me/permissions` so a client gates its UI on the server's answer rather
  than on a second copy of the role map. The client renders `/account` and
  `/institutions/[id]/roles` over them.
- **Identity linking** (step 26) — a provider subject resolves to a platform user by
  `(institution, issuer, subject)`, else provisions one with an unusable password. A shared
  email is never adopted silently: it raises `IDENTITY_EMAIL_CONFLICT` and must be linked
  deliberately.
- **Institution configuration** (step 28) — `institution_settings` carries terminology
  overrides, feature flags and the connector each institution is pointed at;
  merged with the platform defaults so a caller always sees every key resolved.
  `GET`/`PATCH institutions/:id/configuration` sit behind `institution:read` /
  `institution:manage`, and the client renders `/institutions/[id]/settings` over them.
  Terminology overrides are label-only.
- **Connectors** (steps 13, 14, 29) — `AcademicSystemConnector` and
  `LearningSystemConnector` interfaces with a `capabilities()` map, plus `mock-sis`: a
  deterministic SIS built from a seed and a fixed anchor date, generating ~5k linked records
  and honouring `changedSince`. `ConnectorRegistry` resolves a connector by the name the
  institution configured; `GET institutions/:id/connectors` reports health and capabilities.
- **Scoped authorization** (step 27) — a permission catalogue mapped from `CANONICAL_ROLES`,
  a `ScopeHierarchyService` that walks org-unit ancestry to decide which grants enclose a
  target scope, and `@RequirePermission` behind a `PermissionsGuard`. Institution scoping is
  enforced by `InstitutionScopedRepository`, which every canonical-table repository extends.
- **Synchronization engine** (steps 35–36) — a run walks the academic connector domain by
  domain in dependency order, upserting on `(institution_id, source_system, external_id)`
  behind a stale-write guard, tombstoning deleted records, provisioning a user plus
  `ExternalIdentity` per person, and pruning teaching assignments and study-group members the
  source dropped. `sync_runs`, `sync_domain_results` and `sync_watermarks` hold the job state
  machine and per-domain watermark, so an incremental run asks only for `changedSince` and a
  failed record holds its domain's watermark back instead of being skipped. Runs go through
  BullMQ, one at a time per institution behind the Redis lock, driven by
  `POST`/`GET institutions/:id/synchronization/runs` and `GET .../state` behind `sync:run` /
  `sync:read`.
- **API contract** — `openapi.json` generated from decorators, committed, drift-checked by
  `pnpm openapi:check`; the frontend client is generated from it.
- **CI** — `.github/workflows/`: lint, typecheck, test, OpenAPI drift, migrations, build,
  pnpm audit, CodeQL and Trivy scanning. `pnpm verify` is the same gate locally.

## Not done

- No endpoints over the canonical academic tables: synchronization fills them, nothing reads
  them. Courses, offerings, enrolment, grades and scheduling have no API and no screen.
- A grant names its subject and scope by identifier: there is no person or scope search
  behind those fields yet, because neither a user directory nor an org-unit read exists.
- Synchronization has no screen: runs are queued and read over the API only, and nothing
  schedules them — every run is triggered by hand. Reconciliation (step 37) and sync-freshness
  metrics are not built either.
- No LMS connector implementation — the interface exists, Moodle does not.
- Institution configuration is read straight from the database on every call; no caching.
- The flat `user`/`admin` `RolesGuard` still governs the existing user endpoints; the two
  guards are orthogonal and `RolesGuard` should retire as canonical routes replace them.
- No OIDC strategy: `IdentityLinkingService` is the model an OIDC callback will call, but the
  strategy itself is blocked on institutional client registration.
- Theses, transcripts, notifications and audit are intentionally absent from the model.

## Next task — canonical reads, then sync monitoring

- The canonical tables now hold real data, and nothing reads it. Next are the first read
  endpoints over it (dashboard, courses, grades) — each with `@RequirePermission` from day
  one and a matching client screen, per the working agreement in `docs/Task Tracker.md`.
- Then the sync monitoring screen (step 47) over the run and state endpoints that already
  exist, plus a schedule so runs are not hand-triggered, and freshness gauges for step 53.
- Step 64's second university should then be a row in `institutions`, a settings row and a
  second `mock-sis` registration with different options — no core code change. That is the
  claim to test.

## Caveats

- `docs/Tasks Plan.md` and `docs/System Plan.md` are research output, not gospel. Prefer the
  codebase, `docs/Task Tracker.md` and current best practice where they conflict, and fix the
  doc when they do.
- Both docs contain broken citation markers (`cite…turn20view0`) — invisible private-use
  Unicode. They break exact-string edits; anchor edits on clean text.
- Steps 1–22 are design tasks whose status was inferred from the docs, not verified.
- The client's `pnpm size` budget (330 kB) is exceeded and was already exceeded before this
  work: 376.63 kB on `dev` beforehand, 391.68 kB now that `Switch` joins the shared UI
  barrel. `pnpm verify` fails on that step alone in the client; every other check is green.
