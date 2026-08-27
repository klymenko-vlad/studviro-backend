# Status

Handoff note for the next agent. Keep it under ~100 lines; trim rather than append.

Last updated: 2026-08-27

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
- **API and CI** — generated, drift-checked `openapi.json`; both repositories run lint,
  typecheck, coverage, build and security/contract gates in CI and through `pnpm verify`.

## Not done

- Scheduling, exam terms, programs and the course catalogue still have no read API or screen.
  Courses are reachable only through the caller's enrolments; no search exists.
- Role grants still require raw subject and scope identifiers because there is no user or
  organization-unit directory.
- Synchronization has no UI or schedule. Reconciliation, retry controls and exported
  freshness metrics are absent; runs are triggered through the API by hand.
- No Moodle or AIS2 connector implementation. AIS2 and OIDC require institutional access.
- Institution configuration is read from PostgreSQL on every call; no caching.
- The legacy flat `RolesGuard` still governs old user endpoints and should retire as
  canonical routes replace them.
- Theses, transcripts, notifications and audit are intentionally absent from the model.

## Next task — sync monitoring and retry UI, step 47

- Build an institution-administrator synchronization screen over the existing run and state
  endpoints. Show current freshness, run history, per-domain counts/errors and active state;
  let an authorized administrator start a run again when a run fails. Gate reads/actions on
  `sync:read` / `sync:run`, cover loading/empty/error/denied states, and browser-check it.
- Do not absorb scheduling, reconciliation or Prometheus freshness gauges into step 47;
  record those as steps 37 and 53 so this remains one vertical backlog step.
- After step 47, build the student dashboard (step 38) from the course and grade tiles now
  available, unless the tracker names a newly unblocked prerequisite first.

## Caveats

- `Tasks Plan.md` and `System Plan.md` are research output and contain broken private-use
  citation markers; prefer the code, tracker and current practice.
- Steps 1–22 were inferred from documents, not re-verified.
- The client bundle is 424.19 kB gzipped after step 41 against a 435 kB guard. The next honest
  reduction is a lighter Select or a narrower shared UI export, not silently removing the gate.
- Local development needs uncommitted `.env` files. Every port is env-driven. The dev seed
  creates only two users; canonical demo data requires a `mock-sis` run or explicit fixtures.
