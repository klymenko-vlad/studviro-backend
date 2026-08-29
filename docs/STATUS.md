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

- **Foundation** — modular monolith (ADR 0002), `ROLE=api|worker|all`, validated env, graceful
  shutdown, request limits, Pino correlation logs, health, metrics, BullMQ, Redis locks and
  idempotency.
- **Persistence and canonical model** — Drizzle migrations, transaction-mediated and
  institution-scoped repositories, keyset pagination, soft deletion, provenance and 25 academic
  tables (ADR 0009). External identifiers are never primary keys.
- **Authentication and identity** — argon2 credentials, rotating JWT/refresh sessions
  (ADR 0003), linked-identity reads and conflict-safe provisioning. OIDC remains blocked on
  institutional registration.
- **Authorization** — canonical roles, scope ancestry, the permission catalogue,
  `PermissionsGuard` / `@RequirePermission`, role assignment routes and the client role UI.
- **Institution setup** — terminology, flags and connector selection resolve over platform
  defaults through a guarded configuration API and settings screen.
- **Connectors and synchronization** — connector contracts, deterministic `mock-sis`, registry
  health/capabilities, ordered imports, provenance upserts, stale-write guards, tombstones,
  child pruning, watermarks and a locked BullMQ run state machine.
- **Course reads** (step 40) — the caller's term-grouped courses and a guarded 360° course
  page with staff, own enrolment and study groups.
- **Grades with provenance** (step 41) — `GET institutions/:id/me/course-results` behind
  `grade:read` returns the calculated/proposed/official stages, the effective grade and source
  metadata, on a grades screen and on each course page.
- **Sync monitoring and retry** (step 47) — `/institutions/:id/sync` shows freshness per
  domain, the latest run's per-domain counts and errors, and run history; `sync:run` starts
  another and the screen polls while one is in flight.
- **Student dashboard** (step 38) — `/institutions/:id` composes the reads already shipped
  into a current-term course tile, a results tile and a rest-of-this-week tile, each gated on
  the server's own answer (`enrollment:read`, `grade:read`, `schedule:read`) and linking
  through to its full screen. No new endpoint.
- **Unified calendar** (step 39) — `GET institutions/:id/me/timetable-events` behind
  `schedule:read` returns the events overlapping a date range with room, study group, course,
  term and provenance. A student sees the events of every offering they are enrolled in, and a
  group event only as a member of that group; a teacher sees every event of an offering they
  teach. `/institutions/:id/calendar` renders the week, grouped by day in the institution's
  display timezone, with week navigation.
- **Exam terms** (step 42) — `GET institutions/:id/me/exam-terms` behind `schedule:read`
  returns every exam term of an offering the caller attends or teaches, with kind, room,
  examiner, capacity, seats still free, the registration window and the caller's own
  registration — never another student's. `/institutions/:id/exams` splits them into upcoming
  and past, and each course page carries the same terms for its own offering.
- **API and CI** — generated, drift-checked `openapi.json`; both repositories run lint,
  typecheck, coverage, build and security/contract gates in CI and through `pnpm verify`.
- **Navigation and account creation** — `widgets/app-header` in the root layout,
  `widgets/institution-nav` as a permission-gated tab bar on every `/institutions/:id` screen,
  `/sign-up`, and `src/proxy.ts` protecting `/account` and `/institutions`.
- **Deployment is migration-aware** — `pnpm db:migrate:prod` runs the compiled migrator
  inside the pruned production image, and `/health/ready` now fails when
  `drizzle.__drizzle_migrations` is behind the journal shipped in the image. See
  `docs/Deployment.md`.

## Not done

- Programs and the course catalogue still have no read API or screen, though `mock-sis`
  imports both. Courses are reachable only through the caller's enrolments; no search exists.
- Neither the calendar nor the exams screen can be filtered, though both endpoints take
  `offeringId` and a type; the calendar still shows no exam terms alongside classes.
- Nothing writes an exam registration: `mock-sis` imports none and there is no registration
  endpoint, so `myRegistration` is null for imported data until step 43.
- The account screen's institution card links every section but Calendar and Exams; only the
  institution tab bar reaches those two.
- Role grants still require raw subject and scope identifiers because there is no user or
  organization-unit directory.
- Synchronization has no schedule (step 37 covers reconciliation, step 53 the Prometheus
  freshness gauges). Runs are still started by hand, now from the screen rather than curl.
- No Moodle or AIS2 connector implementation. AIS2 and OIDC require institutional access.
- Institution configuration is read from PostgreSQL on every call; no caching.
- The legacy flat `RolesGuard` still governs old user endpoints and should retire as
  canonical routes replace them.
- Theses, transcripts, notifications and audit are intentionally absent from the model.

## Deployment caveat — act on this first

Render's service must run `pnpm db:migrate:prod` as its **Pre-Deploy Command** and probe
`/health/ready`. Until it does, the hosted database has no schema and every query fails
with `relation "users" does not exist` — which is where it stood on 2026-08-29. Details in
`docs/Deployment.md`.

## Next task — controlled exam registration, step 43

- Step 42 shipped the read; registration is the write. Add `POST` and `DELETE` on
  `institutions/:id/me/exam-registrations` behind `enrollment:manage`, enforcing the rules the
  read already surfaces: the registration window must be open, the term must not be cancelled,
  capacity must not be exceeded, and one live registration per user per term — the partial
  unique index on `exam_registrations` already says so. Decide what a second registration for
  the same course's other term means; SIS practice is one live registration per course.
- The client half belongs on the existing `ExamTermCard`, which already carries
  `registrationState`, `isFull` and `myRegistration`. Put the mutation in `features/` per FSD,
  invalidate `examTermQueries.listKey`, and gate the button on the server's permission answer.
- Regenerate `openapi.json`, then `pnpm api:generate`. Browser-check the whole loop: register,
  watch the seat count fall, cancel, watch it rise.

## Caveats

- `Tasks Plan.md` and `System Plan.md` are research output and contain broken private-use
  citation markers; prefer the code, tracker and current practice.
- Steps 1–22 were inferred from documents, not re-verified.
- The client bundle measures 419.45 kB gzipped against the 455 kB guard — the exams screen
  cost 5.9 kB. Take the Radix Select swap recorded under _Carried work_ before raising the
  guard, not before spending the headroom.
- Local development needs uncommitted `.env` files. Every port is env-driven, and the backend
  `.env` must match the ports `docker-compose.yml` publishes (5432 / 6379). The dev seed creates
  only two users and no institution; canonical demo data requires an institution row, a role
  grant, `academicSystemConnector: mock-sis` and a `mock-sis` run. `mock-sis` schedules its
  teaching weeks from the term start, so a calendar check needs an enrolment for the signed-in
  user and the week navigation to reach the first teaching week. `mock-sis` schedules exam
  terms three weeks after each term's teaching ends, so a local exams check needs an enrolment;
  the step 42 walk inserted two future terms and one registration by hand into the dev
  database.
