# Status

Handoff note for the next agent. Keep it under ~100 lines; trim rather than append.

Last updated: 2026-08-29

## What this is

A unified academic platform integrating a Student Information System (AIS2) and an LMS
(Moodle) behind one canonical model. `docs/Tasks Plan.md` holds the 71-step research backlog,
`docs/Task Tracker.md` its live delivery state, and `docs/Feature Status.md` the product view.
The delivery loop is `../.claude/skills/ship-backlog-step/`.

## Stack

NestJS 11 on Fastify · Drizzle + PostgreSQL 17 · Redis 7 · generated OpenAPI · Vitest +
Testcontainers. The client is Next.js 16 App Router with Feature-Sliced Design and acts as
the BFF. Decisions live in `docs/adr/`.

## Done

- **Foundation** — modular monolith (ADR 0002), `ROLE=api|worker|all`, validated env,
  graceful shutdown, request limits, Pino correlation logs, health, bearer-protected
  Prometheus metrics, BullMQ, Redis locks and idempotency.
- **Persistence and canonical model** — Drizzle migrations, transaction-mediated and
  institution-scoped repositories, keyset pagination, soft deletion, full provenance and
  25 academic tables (ADR 0009). External identifiers are never primary keys.
- **Authentication and identity** — argon2 credentials, rotating JWT/refresh sessions
  (ADR 0003), linked-identity reads and conflict-safe provider-subject provisioning. OIDC
  itself remains blocked on institutional registration.
- **Authorization** — canonical roles, scope ancestry, the permission catalogue,
  `PermissionsGuard` / `@RequirePermission`, role assignment routes and the client role UI.
- **Institution setup** — terminology, flags and connector selection resolve over platform
  defaults through a guarded configuration API and settings screen.
- **Connectors and synchronization** — connector contracts, deterministic `mock-sis`,
  registry health/capabilities, ordered imports, provenance upserts, stale-write guards,
  tombstones, child pruning, per-domain watermarks and a locked BullMQ run state machine.
- **Course reads** (step 40) — the caller's term-grouped courses and a guarded 360° course
  page with staff, own enrolment and study groups.
- **Grades with provenance** (step 41) — `GET institutions/:id/me/course-results` behind
  `grade:read`, filterable by offering and term, returns calculated/proposed/official stages,
  the effective grade, points and source/synchronization metadata. The client renders a
  dedicated grades screen and the caller's result on each course page.
- **Sync monitoring and retry** (step 47) — `/institutions/:id/sync` shows freshness per
  domain, the latest run broken down by domain with counts and errors, and run history.
  An administrator with `sync:run` can start an incremental or full run; the screen polls
  itself while one is in flight and disables a second start. Reads gate on `sync:read`.
- **API and CI** — generated, drift-checked `openapi.json`; both repositories run lint,
  typecheck, coverage, build and security/contract gates in CI and through `pnpm verify`.

## Not done

- Scheduling, exam terms, programs and the course catalogue still have no read API or screen.
  Courses are reachable only through the caller's enrolments; no search exists.
- Role grants still require raw subject and scope identifiers because there is no user or
  organization-unit directory.
- Synchronization has no schedule (step 37 covers reconciliation, step 53 the Prometheus
  freshness gauges). Runs are still started by hand, now from the screen rather than curl.
- No Moodle or AIS2 connector implementation. AIS2 and OIDC require institutional access.
- Institution configuration is read from PostgreSQL on every call; no caching.
- The legacy flat `RolesGuard` still governs old user endpoints and should retire as
  canonical routes replace them.
- Theses, transcripts, notifications and audit are intentionally absent from the model.

## Next task — unified student dashboard, step 38

- Compose the student's landing view from what already reads: the term-grouped courses from
  step 40 and the results from step 41. One screen at `/institutions/:id`, tiles gated on the
  permissions the server already answers (`enrollment:read`, `grade:read`), each tile linking
  through to its full screen. Cover loading, empty, error and denied states, and browser-check it.
- Do not absorb the calendar (step 39) or exam terms (step 42) into it; leave a placeholder or
  omit the tile rather than building a second read API inside step 38.
- Watch the bundle: the guard is 440 kB and the build measures 436.83 kB. A dashboard that
  reuses the existing cards should add little, but if it pushes the number, take the Select
  reduction described in `.size-limit.mjs` rather than raising the limit again.

## Caveats

- `Tasks Plan.md` and `System Plan.md` are research output and contain broken private-use
  citation markers; prefer the code, tracker and current practice.
- Steps 1–22 were inferred from documents, not re-verified.
- The client bundle is 436.83 kB gzipped against a 440 kB guard, raised from 435 kB for step 47
  after narrowing the `apiSchemas` and `apiQueries` namespace re-exports and dropping the unused
  `sdk.gen` class exports recovered 1.25 kB. The next honest reduction is a lighter Select — it
  is the largest thing in the shared chunk and the barrel narrowing cannot reach it.
- Local development needs uncommitted `.env` files. Every port is env-driven, and the backend
  `.env` must match the ports `docker-compose.yml` publishes (5432 / 6379). The dev seed creates
  only two users and no institution; canonical demo data requires an institution row, a role
  grant, `academicSystemConnector: mock-sis` and a `mock-sis` run.
