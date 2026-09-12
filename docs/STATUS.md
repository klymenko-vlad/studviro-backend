# Status

Handoff note for the next agent. Keep it under ~100 lines; trim rather than append.

Last updated: 2026-09-12

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
  shutdown, request limits, Pino correlation logs, health, metrics, BullMQ, Redis locks, idempotency.
- **Persistence and canonical model** — Drizzle migrations, transaction-mediated institution-scoped
  repositories, keyset pagination, soft deletion, provenance, 25 academic tables (ADR 0009). External
  identifiers are never primary keys.
- **Authentication and authorization** — argon2 credentials, rotating JWT/refresh sessions (ADR 0003),
  linked-identity provisioning, canonical roles, scope ancestry, the permission catalogue,
  `PermissionsGuard` / `@RequirePermission` and the role assignment UI. OIDC is blocked on
  institutional registration.
- **Institution setup, connectors and synchronization** — terminology, flags and connector selection
  resolving over platform defaults through a guarded configuration API and settings screen; connector
  contracts, deterministic `mock-sis`, registry health/capabilities, ordered imports, provenance
  upserts, stale-write guards, tombstones, child pruning, watermarks and a locked run state machine.
- **Connector credentials** (step 46) — a connector declares the fields it needs via
  `credentialFields()`, and the settings screen renders that declaration rather than a connector-shaped
  form. `GET`/`PUT institutions/:id/connectors/:kind/credentials` and `DELETE .../:fieldKey` sit behind
  the new `connector:configure`, held by `institution_admin` alone. Values are AES-256-GCM encrypted in
  `connector_credentials` under `CONNECTOR_CREDENTIAL_SECRET`; the API answers whether a field is set and
  when it last changed, never the value and never a masked stand-in. See ADR 0014.
- **Course reads, grades, dashboard, sync monitoring** (steps 38, 40, 41, 47) — term-grouped
  courses and a 360° course page; `me/course-results` behind `grade:read` with the
  calculated/proposed/official stages and their provenance; a dashboard composing them; and
  `/institutions/:id/sync` showing freshness, run counts, errors and history behind `sync:run`.
- **Unified calendar** (step 39) — `GET institutions/:id/me/timetable-events` behind
  `schedule:read`, scoped to the offerings and groups the caller belongs to;
  `/institutions/:id/calendar` renders the week in the institution's display timezone, filtered by
  course and type on the server, with exam terms interleaved as a second fetched layer that the
  reader can switch off. An exam term is never synthesized into a timetable event — see ADR 0013.
- **Exam terms and registration** (steps 42–43) — `me/exam-terms` behind `schedule:read` returns every
  term of an offering the caller attends or teaches, with the caller's own registration and never
  another student's. `POST`/`DELETE .../me/exam-registrations` behind `exam:register` enforce the
  window, the cancellation, free capacity and one live registration per course. The read answers
  `registrationAvailability` from those same rules, so the client keeps no second copy of them and every
  card says why a seat is out of reach. `/institutions/:id/exams` filters on the server. ADR 0011, 0013.
- **Teaching and rosters** (step 45) — `me/teaching-offerings` behind `offering:read`, and an
  offering roster behind `enrollment:read` that additionally demands the caller teach the offering
  or hold `offering:manage` — `enrollment:read` alone is held by every student and must never open
  a classmate list. `/institutions/:id/teaching`, plus a roster panel on each course page.
- **Notifications** (step 44) — `notification_events` and `notification_deliveries` carry the first
  push: the exam terms importer emits on publish, move and cancel, the dedupe key `type:subject:day`
  folds repeats into one event with an `occurrence_count`, and a re-occurrence clears `read_at`. The
  inbox and its two mark-read writes sit behind `notification:read`, scoped to the caller's own
  deliveries, on `/institutions/:id/notifications`. See ADR 0012.
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
- `mock-sis` imports no exam registrations, so an imported term shows `myRegistration: null`
  until a student registers by hand. Nothing reconciles a registration back to a source system.
- The calendar's course picker lists only the courses that have an event in the week on screen, so a
  course with no class that week cannot be selected. Neither screen remembers a filter in the URL, so
  a filtered view cannot be linked or survive a reload.
- The account screen's institution card links every section but Calendar, Exams and Teaching; only
  the institution tab bar reaches those three.
- The teaching screen has no term filter and no per-offering action beyond opening the course page. The
  roster is a flat list naming every enrolment including withdrawn and rejected ones, with no filter by
  group or status. Role grants still need raw identifiers because there is no directory — the roster is
  the obvious source for a picker.
- Synchronization has no schedule (step 37 is reconciliation, step 53 the freshness gauges); runs are
  started by hand. No Moodle or AIS2 connector — both need institutional access. Institution
  configuration is read from PostgreSQL on every call. The legacy flat `RolesGuard` still governs the
  old user endpoints and should retire as canonical routes replace them.
- Nothing consumes a stored credential yet: `ConnectorCredentialsService.valuesFor` exists and is tested,
  but `mock-sis` ignores the field it declares, so the first real reader arrives with the first real
  connector. There is no key rotation — the `v1.` prefix reserves room for one, and changing the secret
  invalidates every stored value. Field mapping (the other half of step 46's original wording) is not
  built and is now tracked as its own `Planned` row in `Feature Status.md`. The card's `Complete` badge
  reads oddly against a connector whose only field is optional — it is true and unhelpful at once, and
  wants either a third state or no badge when nothing is required.
- Only exam terms emit notifications; grades, enrolments and timetable events detect changes the emitter
  could take unchanged, and staff are notified of nothing. The inbox is per institution with no unread
  badge in the app header, is never pruned, has no preferences and no channel but itself.
- Theses, transcripts and audit are intentionally absent from the model.

## Deployment caveat — act on this first

Render's service must run `pnpm db:migrate:prod` as its **Pre-Deploy Command** and probe
`/health/ready`. Until it does, the hosted database has no schema and every query fails
with `relation "users" does not exist` — which is where it stood on 2026-08-29. Details in
`docs/Deployment.md`.

## Next task — mapping, conflict and reconciliation UI, step 48

- Step 48 is the oldest unstarted row in the delivery band and now has both its dependencies: step 46's
  connector configuration shipped, and the synchronization engine already records provenance,
  `synchronization_status` and stale-write outcomes per row. Step 37 (reconciliation) is the sibling;
  read both entries in `Tasks Plan.md` and decide which half is the backend of the other.
- The substance is what an administrator does when two systems disagree about the same canonical row.
  Today a conflict is only a `synchronization_status` value nobody can see or act on. Decide first
  whether resolution writes a platform-authored override that survives the next import, or merely marks
  a winner — the two produce different tables, and the answer belongs in an ADR.
- The sync screen at `/institutions/:id/sync` is where this lands; it already shows freshness, run
  counts and errors, and has no per-row view to drill into.

## Caveats

- `Tasks Plan.md` and `System Plan.md` are research output and contain broken private-use
  citation markers; prefer the code, tracker and current practice.
- Steps 1–22 were inferred from documents, not re-verified.
- The client bundle measures 438.1 kB gzipped against the 455 kB guard — the credentials form cost 2.8 kB.
  `pnpm size` is green with under 17 kB of headroom left; take the Radix Select swap before raising the
  guard, not before spending what remains.
- Local development needs uncommitted `.env` files, with the backend's ports matching what
  `docker-compose.yml` publishes (5432 / 6379). The dev seed creates two users and no institution;
  demo data needs an institution row, a role grant, `academicSystemConnector: mock-sis` and a run. Every
  walk so far has had to hand-edit that data to reach its screen. A seed producing a signed-in user with
  a plausible student _and_ teacher life would pay for itself — this is now the longest-standing tax on
  the loop.
