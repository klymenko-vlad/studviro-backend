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
  domain, the latest run's counts and errors and run history; `sync:run` starts another.
- **Student dashboard** (step 38) — `/institutions/:id` composes the shipped reads into
  course, results and week tiles, each gated on the server's own permission answer.
- **Unified calendar** (step 39) — `GET institutions/:id/me/timetable-events` behind
  `schedule:read`, scoped to the offerings and groups the caller belongs to;
  `/institutions/:id/calendar` renders the week in the institution's display timezone.
- **Exam terms** (step 42) — `GET institutions/:id/me/exam-terms` behind `schedule:read`
  returns every term of an offering the caller attends or teaches, with kind, room, examiner,
  seats, window and the caller's own registration — never another student's. Shown on
  `/institutions/:id/exams` and each course page.
- **Exam registration** (step 43) — `POST institutions/:id/me/exam-registrations` and
  `DELETE .../:registrationId` behind the new `exam:register` permission let a student take and
  give up a seat: the window must be open, the term not cancelled, a seat free, and one live
  registration per course. Cancelling soft-deletes, so the seat and the right to register
  return. Every exam term card, on the exams screen and on each course page, carries the
  button. See ADR 0011.
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
- `mock-sis` imports no exam registrations, so an imported term shows `myRegistration: null`
  until a student registers by hand. Nothing reconciles a registration back to a source system.
- The exams screen has no way to see only the terms a student may act on; the registration
  button is disabled with the reason only in the window label beside it.
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

## Next task — teacher course and roster dashboard, step 45

- Everything shipped so far answers "what am I, the student, enrolled in". A teacher sees the
  same course page but nothing that lists *their* teaching: the offerings they lead, who is
  enrolled, and which exam terms they examine. `teaching_assignments`, `enrollments` and
  `exam_terms` already carry it.
- Add `GET institutions/:id/me/teaching-offerings` behind `offering:read` (the caller's
  teaching assignments, grouped by term) and a roster read for one offering behind
  `enrollment:read`, scoped to an offering the caller actually teaches. Then a
  `/institutions/:id/teaching` screen with a roster panel on the course page, both gated on
  the server's permission answer and linked from `widgets/institution-nav`.
- Regenerate `openapi.json`, then `pnpm api:generate`. Walk it as a teacher: the dev database's
  `mock-sis` data has teaching assignments, so grant a `teacher` role and follow one.

## Caveats

- `Tasks Plan.md` and `System Plan.md` are research output and contain broken private-use
  citation markers; prefer the code, tracker and current practice.
- Steps 1–22 were inferred from documents, not re-verified.
- The client bundle measures 421.7 kB gzipped against the 455 kB guard — the registration
  button cost 2.3 kB. Take the Radix Select swap recorded under _Carried work_ before raising the
  guard, not before spending the headroom.
- Local development needs uncommitted `.env` files. Every port is env-driven, and the backend
  `.env` must match the ports `docker-compose.yml` publishes (5432 / 6379). The dev seed creates
  only two users and no institution; canonical demo data requires an institution row, a role
  grant, `academicSystemConnector: mock-sis` and a `mock-sis` run. `mock-sis` schedules its
  teaching weeks from the term start, so a calendar check needs an enrolment for the signed-in
  user and the week navigation to reach the first teaching week. `mock-sis` schedules exam
  terms three weeks after each term's teaching ends, so a local exams check needs an enrolment;
  the step 42 walk inserted two future terms and one registration by hand into the dev
  database, and the step 43 walk widened two exam terms' registration windows to today.
