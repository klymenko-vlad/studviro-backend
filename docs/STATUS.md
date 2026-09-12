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

Two reviews, recorded in full with their evidence in `docs/Task Tracker.md`: _Gaps found outside
the backlog_ (G1–G12, things not built) and _Business-logic and user-flow defects_ (B1–B12, things
built to a rule the model does not enforce). `Feature Status.md` is corrected where a `Live` row
turned out not to be. Read those before starting; the headlines:

- **Onboarding is the largest hole.** An imported person's password is a hash of two random UUIDs
  and there is no reset, verification or claim flow, so they can never sign in; if they self-register
  first, `IDENTITY_EMAIL_CONFLICT` fails that record on every run and holds the `persons` watermark
  back for ever, with nothing able to resolve it (**B1**). Membership _is_ a role assignment, only
  the admin screen creates one, and the first admin needs SQL — so a new account lands on `/account`
  with nowhere to go and an import yields permission-less accounts (**B2**, with G6, G7).
- **Enrolment status is never enforced** (**B3**). A withdrawn, rejected or finished student may
  register for an exam, and withdrawn enrolments appear in _My courses_, the course page, the
  calendar and the teacher's enrolment count. The notification emitter is the only code that
  filters on status, so the two halves of the exam flow disagree.
- **Rules that exist only as enums.** The retake ladder, the attendance outcomes and the `attempt`
  columns are unenforced and unwritten, the unique indexes make a resit overwrite the failed
  attempt, and nothing knows FX is a fail, so no credit total or average is computable (**B4**). An
  `annulled` result still shows its grade (**B5**). All seven feature flags gate nothing (**B6**)
  and terminology overrides are never rendered (**B7**).
- **Flows that end badly.** A cancelled exam term leaves its registrations live, so the
  one-registration rule blocks the replacement by naming a term that no longer exists (**B9**);
  notifications reach everyone enrolled rather than everyone holding a seat, and never the examiner
  (**B10**); a cancellation is soft-deleted so nobody can see it happened (**B11**); your own
  registration is never confirmed (**B12**).
- **Not built at all.** No write-back, so a registration never leaves StudViro (**G1**); the LMS
  half of the model is dead and no backlog step plays the part `mock-sis` played for the SIS half
  (**G2**, **G3**); eight of twenty-two permissions have no endpoint — no catalogue, no grade entry,
  no enrolment correction (**G4**, **G8**); no self-service enrolment (**G5**); no onboarding,
  directory or org-unit read (**G6**, **G7**); one notification family (**G9**); no sync schedule
  (**G10**); step 37's backend uncommitted (**G11**); GDPR, threat model, audit and export unstarted
  while personal data is already served (**G12**).
- Smaller, known: the calendar's course picker lists only courses with an event that week and no
  filter survives a reload; the account card omits Calendar, Exams and Teaching; no credential key
  rotation; configuration is read from PostgreSQL on every call; the legacy flat `RolesGuard` still
  governs the old user endpoints; theses and transcripts are intentionally out of the model.

## Deployment caveat — act on this first

Render's service must run `pnpm db:migrate:prod` as its **Pre-Deploy Command** and probe
`/health/ready`. Until it does, the hosted database has no schema and every query fails
with `relation "users" does not exist` — which is where it stood on 2026-08-29. Details in
`docs/Deployment.md`.

## Next task — land step 37, then close the enrolment-status hole

**First, G11: step 37's backend is written and uncommitted on `dev`.** `reconciliation.service.ts`,
`reconciliation.types.ts`, its spec and its response DTO are untracked; the controller, module,
`provenance.repository.ts` and the sync e2e spec are modified.
`GET institutions/:id/synchronization/reconciliation` reads both sides live and reports
`missing_in_platform`, `missing_in_source`, `stale` and `conflict` per domain, resolving nothing.
Run `pnpm verify`, then commit it as step 37's backend half — nothing else should start on top of
an uncommitted tree.

**Then take B3 as the next step.** It is contained, it is a correctness defect rather than a
feature, and it touches five surfaces at once: decide which enrolment statuses count as
participation, put that decision in one predicate, and apply it to exam registration, _My
courses_, the course page, the calendar and the teacher's enrolment count. The notification
emitter's `NOTIFIABLE_ENROLLMENT_STATUSES` is the existing precedent and the obvious seed.

**Then the recommended order:**

1. **B1 + B2 — onboarding**, with G6 and G7. Institution creation, a seed that produces a signed-in
   student and teacher, roles derived from canonical data rather than typed UUIDs, and a way for a
   real person to claim their imported identity. This also retires the longest-standing tax on the
   loop, the hand-edited demo data.
2. **Step 48**, the screen over the reconciliation read. The sibling question is now answered:
   step 37 is the backend of step 48. Decide in an ADR first whether resolving a discrepancy writes
   a platform-authored override that survives the next import or merely marks a winner.
3. **G2 — a `mock-lms` connector and the learning-domain importers.** It unblocks G3 and the
   product's central claim, and no numbered step covers it.
4. **G1's write-back ADR**, then B4/B5/B9/B11 together as the exam-lifecycle step, then G4/G8
   (grade entry), then B6 (make the flags mean something).

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
