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

Detail lives in `docs/Task Tracker.md` (delivery) and `docs/Feature Status.md` (product); the
reasoning lives in `docs/adr/`. In short:

- **Foundation** — modular monolith (ADR 0002), `ROLE=api|worker|all`, validated env, graceful
  shutdown, request limits, Pino correlation logs, health, metrics, BullMQ, Redis locks, idempotency.
- **Persistence** — Drizzle migrations, transaction-mediated institution-scoped repositories, keyset
  pagination, soft deletion, provenance, 25 academic tables (ADR 0009). External identifiers are
  never primary keys.
- **Auth** — argon2 credentials, rotating JWT/refresh sessions (ADR 0003), linked-identity
  provisioning, canonical roles, scope ancestry, the permission catalogue, `PermissionsGuard` /
  `@RequirePermission` and the role assignment UI. OIDC is blocked on institutional registration.
- **Institution setup and synchronization** — terminology, flags and connector selection resolving
  over platform defaults; connector contracts, deterministic `mock-sis`, registry health and
  capabilities, ordered imports, provenance upserts, stale-write guards, tombstones, child pruning,
  watermarks and a locked run state machine (ADR 0010).
- **Connector credentials** (46) — a connector declares its fields; values are AES-256-GCM encrypted
  and never echoed back, behind `connector:configure` held by `institution_admin` alone (ADR 0014).
- **Student and teacher surfaces** (38–45, 47) — courses and a 360° course page; grades with the
  calculated/proposed/official stages and their provenance; a dashboard; the week calendar with exam
  terms as a second layer (ADR 0013); exam terms and controlled registration with the server
  answering why a seat is out of reach (ADR 0011); teaching offerings and rosters, where
  `enrollment:read` alone never opens a classmate list; the notification inbox with
  `type:subject:day` deduplication (ADR 0012); and sync monitoring behind `sync:run`.
- **API, CI, navigation, deployment** — generated drift-checked `openapi.json`; lint, typecheck,
  coverage, build and security gates in both repositories; the app header, permission-gated
  institution tab bar, `/sign-up` and route protection; and a migration-aware deploy whose
  `/health/ready` fails when the database is behind the journal in the image.

## Not done — reviewed against the code on 2026-09-12

The twelve gaps below are recorded in full, with evidence, in `docs/Task Tracker.md` under
_Gaps found outside the backlog_. `Tasks Plan.md` names none of G1, G2, G5 or G6.

- **G1 — nothing is written back.** `registerForExam` / `registerForCourse` are optional on the
  connector interface, nothing calls them, `mock-sis` implements neither, and no cancel command
  exists. A student who registers for an exam in StudViro is not registered at the university.
  `exam_registrations` is not a sync domain, so the source side is never read either. This wants an
  ADR — is the platform a read-only mirror or a system of engagement? — before 43 or 48 close.
- **G2 — the LMS half of the model is dead.** Six canonical tables (spaces, activities, assessments,
  results, completions, submissions) have no importer, no sync domain, no read and no screen. Steps
  31–33 are all gated on a Moodle instance nobody has, and nothing in the backlog plays the part
  `mock-sis` played for the SIS half. **G3** follows: deadlines never reach a calendar.
- **G4 — eight of twenty-two permissions have no endpoint** (`program:*`, `course:*`,
  `offering:manage`, `enrollment:manage`, `schedule:manage`, `grade:propose`, `grade:publish`). No
  catalogue, no course search, no grade entry (**G8**), no enrolment correction, no timetable edit.
- **G5 — no self-service enrolment**, though the window, the capacity and the
  `requested → provisioning → active` ladder are all modelled. **G6 — no institution onboarding**:
  no `POST /institutions`, no org-unit read, so a tenant exists only if someone writes SQL — which
  is also why every walkthrough hand-edits data. **G7 — no person directory.**
- **G9** notifications emit for exam terms and nothing else; **G10** sync has no schedule, though
  `sync_run_trigger` already has `scheduled`; **G12** GDPR (19), threat model (20), audit (49) and
  export (50) are all unstarted while personal data is already imported and served.
- Smaller, already known: the calendar's course picker only lists courses with an event that week
  and neither filter survives a reload; the account card does not link Calendar, Exams or Teaching;
  the roster is unfiltered and names withdrawn and rejected enrolments; no key rotation for
  connector credentials; institution configuration is read from PostgreSQL on every call; the legacy
  flat `RolesGuard` still governs the old user endpoints; theses, transcripts and audit are
  intentionally absent from the model.

## Deployment caveat — act on this first

Render's service must run `pnpm db:migrate:prod` as its **Pre-Deploy Command** and probe
`/health/ready`. Until it does, the hosted database has no schema and every query fails
with `relation "users" does not exist` — which is where it stood on 2026-08-29. Details in
`docs/Deployment.md`.

## Next task — land step 37, then step 48

**First, deal with G11: the reconciliation backend is written and uncommitted on `dev`.**
`reconciliation.service.ts`, `reconciliation.types.ts`, its spec and its response DTO are
untracked; `synchronization.controller.ts`, `.module.ts`, `provenance.repository.ts` and the
sync e2e spec are modified. `GET institutions/:id/synchronization/reconciliation` reads both
sides live and reports `missing_in_platform`, `missing_in_source`, `stale` and `conflict` per
domain, resolving nothing. Run `pnpm verify`, then commit it as step 37's backend half.

**Then step 48 is its screen** — the sibling question in `STATUS.md` is now answered: step 37 is
the backend of step 48. Before building it, decide in an ADR whether resolving a discrepancy
writes a platform-authored override that survives the next import, or merely marks a winner; the
two produce different tables. The drill-down lands on `/institutions/:id/sync`, which already
shows freshness, run counts and errors and has no per-row view.

**After that, the recommended order** is G2 (a `mock-lms` connector and the learning-domain
importers — it unblocks G3 and the product's central claim), then G6 plus a real demo seed, then
G1's write-back ADR, then G4/G8 (grade entry).

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
