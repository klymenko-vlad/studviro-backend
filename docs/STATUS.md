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
  metadata, on a grades screen and each course page.
- **Sync monitoring and retry** (step 47) — `/institutions/:id/sync` shows freshness per
  domain, the latest run's counts and errors and run history; `sync:run` starts another.
- **Student dashboard** (step 38) — `/institutions/:id` composes the shipped reads into
  course, results and week tiles, each gated on the server's own permission answer.
- **Unified calendar** (step 39) — `GET institutions/:id/me/timetable-events` behind
  `schedule:read`, scoped to the offerings and groups the caller belongs to;
  `/institutions/:id/calendar` renders the week in the institution's display timezone.
- **Exam terms and registration** (steps 42–43) — `GET institutions/:id/me/exam-terms` behind
  `schedule:read` returns every term of an offering the caller attends or teaches, with the
  caller's own registration and never another student's. `POST institutions/:id/me/exam-registrations`
  and `DELETE .../:registrationId` behind `exam:register` take and give up a seat: the window must
  be open, the term not cancelled, a seat free, one live registration per course. Cancelling
  soft-deletes, so the seat returns. On `/institutions/:id/exams` and each course page. See ADR 0011.
- **Teaching and rosters** (step 45) — `GET institutions/:id/me/teaching-offerings` behind
  `offering:read` returns the caller's own teaching assignments by term with a live enrolment
  count; `GET institutions/:id/course-offerings/:offeringId/roster` behind `enrollment:read`
  returns the enrolled students, their status, study groups and enrolment date — but only to
  someone who actually teaches the offering or holds `offering:manage`, because `enrollment:read`
  alone is held by every student and must never open a classmate list. `/institutions/:id/teaching`
  lists the offerings; each course page carries a roster panel keyed off the offering's `viewerRole`.
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
- The account screen's institution card links every section but Calendar, Exams and Teaching; only
  the institution tab bar reaches those three.
- The teaching screen cannot be filtered by term and offers no per-offering action beyond opening
  the course page: no grade entry, no roster export, no way to message a group.
- The roster is a flat list — it cannot be filtered by study group or status, and it names every
  enrolment including withdrawn and rejected ones, which the summary counts separately.
- Role grants still require raw subject and scope identifiers because there is no user or
  organization-unit directory. The roster is now the first screen that names people, so it is the
  obvious source for such a picker.
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

## Next task — notification aggregation and deduplication, step 44

- Every read shipped so far is pull-only: a student learns an exam term moved by opening the exams
  screen. Step 44 is the first push, and its dependencies (35, 38–42) are all done.
- Nothing in the canonical model records a notification, so this step owns its own tables — an
  event and a per-recipient delivery, both `institution_id`-scoped and provenance-carrying like
  every other canonical table. The substance of the step is the deduplication rule: one exam term
  rescheduled twice in a sync run must reach a student once. Settle it in an ADR before coding.
- Emit from the change the importers already detect rather than polling, gate reads behind a new
  `notification:read` permission for the recipient only, and put the list behind the app header so
  it is reachable from every screen, not only from an institution tab.

## Caveats

- `Tasks Plan.md` and `System Plan.md` are research output and contain broken private-use
  citation markers; prefer the code, tracker and current practice.
- Steps 1–22 were inferred from documents, not re-verified.
- The client bundle measures 426.1 kB gzipped against the 455 kB guard — the teaching screen and
  roster panel cost 4.4 kB. Take the Radix Select swap recorded under _Carried work_ before raising the
  guard, not before spending the headroom.
- Local development needs uncommitted `.env` files, with the backend's ports matching what
  `docker-compose.yml` publishes (5432 / 6379). The dev seed creates two users and no institution;
  demo data needs an institution row, a role grant, `academicSystemConnector: mock-sis` and a run.
  Every walk so far has had to hand-edit that data to reach its screen — future teaching weeks for
  the calendar, wider registration windows for the exams, and for step 45 a lecturer assignment for
  `admin@studviro.local` on `PF-P106`. A seed that produces a signed-in user with a plausible
  student _and_ teacher life would pay for itself.
