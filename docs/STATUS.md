# Status

Handoff note for the next agent. Keep it under ~100 lines; trim rather than append.

Last updated: 2026-08-27

## What this is

A unified academic platform integrating a Student Information System (AIS2) and an LMS
(Moodle) behind one canonical model, so neither is hard-coded into the core. Full reasoning
in `docs/System Plan.md`; the 71-step backlog is in `docs/Tasks Plan.md` and its live status,
plus the working agreement for backlog work, in `docs/Task Tracker.md`. `docs/Feature
Status.md` is the product-level view of what a user can do today. The delivery loop
itself is the `ship-backlog-step` skill at `../.claude/skills/ship-backlog-step/`.

## Stack

NestJS 11 on Fastify · Drizzle + PostgreSQL 17 · Redis 7 (cache, BullMQ, throttle, locks) ·
class-validator DTOs, Zod for env · generated `openapi.json` · Vitest + Testcontainers.
Client is Next.js 16 App Router (Feature-Sliced Design) and acts as the BFF, converting
platform tokens into httpOnly cookies. Decisions live in `docs/adr/`.

## Done

- **App skeleton** — modular monolith (ADR 0002), `ROLE=api|worker|all`, Zod-validated env,
  graceful shutdown, request timeouts, Helmet/CORS/compression/body limits.
- **Persistence** — drizzle-kit migrations, `TransactionHost`-mediated repositories, keyset
  pagination (ADR 0004), soft-delete and ms-precision timestamps in `schema/_shared.ts`.
- **Auth** — local credentials: argon2, 15-min access JWT carrying `token_version`, opaque
  refresh token stored as SHA-256 and rotated on use, with reuse detection (ADR 0003).
- **Async plumbing and operations** — BullMQ with a shared `BaseProcessor`, Redis lock,
  `Idempotency-Key`; Pino logs with correlation IDs, Terminus health, bearer-protected
  Prometheus metrics, multi-stage `Dockerfile`, `docker-compose.yml`.
- **Canonical academic schema** (step 25) — 25 tables (ADR 0009). External IDs are never
  primary keys: every row carries `institution_id` plus provenance, unique per
  `(institution_id, source_system, external_id)`. Grades split calculated/proposed/official.
- **Role and identity API** — institution-scoped `role-assignments` routes (`role:read`,
  `role:assign`), `users/me/roles`, `users/me/identities`, the caller's institutions, and
  `institutions/:id/me/permissions`, so a client gates its UI on the server's answer rather
  than a second copy of the role map. The client renders `/account` and
  `/institutions/[id]/roles`.
- **Identity linking** (step 26) — a provider subject resolves to a platform user by
  `(institution, issuer, subject)`, else provisions one with an unusable password. A shared
  email is never adopted silently: it raises `IDENTITY_EMAIL_CONFLICT`.
- **Institution configuration** (step 28) — `institution_settings` carries terminology
  overrides (label-only), feature flags and the chosen connector, merged with the platform
  defaults so every key resolves. `GET`/`PATCH institutions/:id/configuration` behind
  `institution:read` / `institution:manage`; the client renders `/institutions/[id]/settings`.
- **Connectors** (steps 13, 14, 29) — `AcademicSystemConnector` and
  `LearningSystemConnector` interfaces with a `capabilities()` map, plus `mock-sis`: a
  deterministic SIS built from a seed and a fixed anchor date, ~5k linked records, honouring
  `changedSince`. `ConnectorRegistry` resolves by configured name;
  `GET institutions/:id/connectors` reports health and capabilities.
- **Scoped authorization** (step 27) — a permission catalogue mapped from `CANONICAL_ROLES`,
  a `ScopeHierarchyService` walking org-unit ancestry to decide which grants enclose a target
  scope, and `@RequirePermission` behind a `PermissionsGuard`. Institution scoping is enforced
  by `InstitutionScopedRepository`, which every canonical-table repository extends.
- **Synchronization engine** (steps 35–36) — a run walks the connector domain by domain in
  dependency order, upserting on the provenance key behind a stale-write guard, tombstoning
  deletions, provisioning a user plus `ExternalIdentity` per person, and pruning children the
  source dropped. `sync_runs`, `sync_domain_results` and `sync_watermarks` hold the state
  machine and per-domain watermark, so an incremental run asks only for `changedSince` and a
  failed record holds its watermark back rather than being skipped. Runs go through BullMQ,
  one per institution behind the Redis lock, driven by
  `POST`/`GET institutions/:id/synchronization/runs` and `GET .../state` (`sync:run`/`sync:read`).
- **Canonical reads** (step 40) — `GET institutions/:id/me/courses` behind `enrollment:read`
  joins the caller's enrolments to their offering, course, term and teaching staff, filtered
  by term or enrolment status. `GET institutions/:id/course-offerings/:offeringId` behind
  `offering:read` adds the 360° view — course, term, teaching staff, the caller's own
  enrolment and the study groups they belong to — and refuses an offering the caller neither
  takes, teaches nor administers. The client renders `/institutions/[id]/courses` grouped by
  term, every title linking to `/institutions/[id]/courses/[offeringId]`.
- **API contract and CI** — `openapi.json` generated from decorators, committed and
  drift-checked; the client is generated from it. `.github/workflows/` runs lint, typecheck,
  test, OpenAPI drift, migrations, build, pnpm audit, CodeQL and Trivy — `pnpm verify` is the
  same gate locally.

## Not done

- Grades, scheduling, exam terms, programs and the course catalogue itself still have no API
  and no screen. The course page shows no timetable, no roster and no results, and a course
  is reachable only from the caller's own enrolment list — there is no course search.
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

## Next task — grades with provenance, step 41

- Step 40 is done. Next is `course_results`, which the schema already splits into
  calculated / proposed / official: `GET institutions/:id/me/course-results` behind
  `grade:read`, carrying each result's kind, grade, points, the offering it belongs to and
  the source system that produced it — the provenance view is the point of the step. Show it
  as its own screen and as a panel on the course page, which already has the offering in
  hand.
- Then the sync monitoring screen (step 47) over the run and state endpoints that already
  exist, plus a schedule so runs are not hand-triggered, and freshness gauges for step 53.
- Then the student dashboard (step 38), which composes the tiles those steps produce.

## Caveats

- `docs/Tasks Plan.md` and `docs/System Plan.md` are research output, not gospel: prefer the
  codebase, `docs/Task Tracker.md` and current best practice, and fix the doc when they
  conflict. Both contain broken citation markers (`cite…turn20view0`) — invisible
  private-use Unicode that breaks exact-string edits; anchor edits on clean text.
- Steps 1–22 are design tasks whose status was inferred from the docs, not verified.
- The client's `pnpm size` budget is now 420 kB and the bundle is 411.04 kB, up 9.67 kB with
  the course page. `pnpm verify` is green in both repositories; the budget has ~9 kB of head
  room, so the next screen may need it raised or the shared UI barrel trimmed.
- Local development needs a `.env` per repository; neither is committed. `.env.example` set
  `METRICS_TOKEN=` empty, which the Zod schema rejects as too short and which stopped the app
  booting — now commented out. Every port is env-driven if 3000/5432/6379 are taken.
- The dev seed creates two users and nothing else: canonical data comes from a `mock-sis`
  run or from hand-written SQL. There is no seeded demo enrolment.
