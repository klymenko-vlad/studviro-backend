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
  `Course`, `CourseOffering` and `LearningSpace` are separate; grades are split into
  calculated / proposed / official.
- **Role and identity API** — institution-scoped `role-assignments` routes (`role:read`,
  `role:assign`), `users/me/roles`, `users/me/identities`, the institutions a caller belongs
  to, and `institutions/:id/me/permissions` so a client gates its own UI on the server's
  answer rather than on a second copy of the role map. The client renders `/account` and
  `/institutions/[id]/roles` over them.
- **Identity linking** (step 26) — `IdentityLinkingService` resolves a provider subject to a
  platform user by `(institution, issuer, subject)`, else provisions one with an unusable
  password. A shared email is never adopted silently: it raises `IDENTITY_EMAIL_CONFLICT`
  and must be linked deliberately through `link()`.
- **Institution configuration** (step 28) — `institution_settings` carries terminology
  overrides, feature flags and the connector each institution is pointed at;
  `InstitutionConfigurationService` merges them with the platform defaults so a caller
  always sees every key resolved. `GET`/`PATCH institutions/:id/configuration` sit behind
  `institution:read` / `institution:manage`, and the client renders
  `/institutions/[id]/settings` over them. Terminology overrides are label-only: the client
  falls back to its own translation wherever an override is absent.
- **Connectors** (steps 13, 14, 29) — `AcademicSystemConnector` and
  `LearningSystemConnector` interfaces with a `capabilities()` map, plus `mock-sis`: a
  deterministic SIS built from a seed and a fixed anchor date, generating ~5k linked records
  (13 org units, 4 terms, 6 programmes, 72 courses, 144 offerings, ~1.2k enrolments,
  timetable, exams and past results) and honouring `changedSince`. `ConnectorRegistry`
  resolves a connector by the name the institution configured; `GET
institutions/:id/connectors` reports health, capabilities and the alternatives installed.
- **Scoped authorization** (step 27) — a permission catalogue mapped from `CANONICAL_ROLES`,
  a `ScopeHierarchyService` that walks org-unit ancestry to decide which grants enclose a
  target scope, `AuthorizationService.can/assert`, and `@RequirePermission` behind a
  `PermissionsGuard`. Institution scoping is enforced by `InstitutionScopedRepository`, which
  every canonical-table repository extends.
- **API contract** — `openapi.json` generated from decorators, committed, drift-checked by
  `pnpm openapi:check`; the frontend client is generated from it.
- **CI** — `.github/workflows/`: lint, typecheck, test, OpenAPI drift, migrations, build,
  pnpm audit, CodeQL and Trivy scanning. `pnpm verify` is the same gate locally.

## Not done

- No endpoints over the canonical academic tables — courses, offerings, enrolment, grades and
  scheduling are still write-only schema. No seed data beyond users.
- A grant names its subject and scope by identifier: there is no person or scope search
  behind those fields yet, because neither a user directory nor an org-unit read exists.
- Nothing imports the mock SIS into the canonical tables: there is no synchronization
  engine, no job state machine and no watermark storage yet. The connector is a source, and
  nothing reads it but the health check.
- No LMS connector implementation — the interface exists, Moodle does not.
- Institution configuration is read straight from the database on every call; no caching.
- The flat `user`/`admin` `RolesGuard` still governs the existing user endpoints; the two
  guards are orthogonal and `RolesGuard` should retire as canonical routes replace them.
- No OIDC strategy: `IdentityLinkingService` is the model an OIDC callback will call, but the
  strategy itself is blocked on institutional client registration.
- Theses, transcripts, notifications and audit are intentionally absent from the model.

## Next task — synchronization engine (steps 35–36), then canonical reads

- The mock SIS supplies data nobody consumes. Next is the engine that walks a connector,
  upserts on `(institution_id, source_system, external_id)`, records a per-domain watermark
  and reports job state. `BaseProcessor`, the Redis lock and the idempotency interceptor are
  its plumbing; `ConnectorRegistry.academicSystem(name)` is how it picks the source.
- After that the first read endpoints over canonical data (dashboard, courses, grades) —
  each with `@RequirePermission` from day one and a matching client screen, per the working
  agreement in `docs/Task Tracker.md`.
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
