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

- **Foundation and persistence** — modular monolith (ADR 0002), `ROLE=api|worker|all`, validated
  env, graceful shutdown, request limits, Pino correlation logs, health, metrics, BullMQ, Redis
  locks, idempotency; Drizzle migrations, transaction-mediated institution-scoped repositories,
  keyset pagination, soft deletion, provenance and 25 academic tables (ADR 0009), where an external
  identifier is never a primary key.
- **Auth** — argon2 credentials, rotating JWT/refresh sessions (ADR 0003), linked-identity
  provisioning, canonical roles, scope ancestry, the permission catalogue, `PermissionsGuard` /
  `@RequirePermission` and the role assignment UI. OIDC is blocked on institutional registration.
- **Institution setup and synchronization** — terminology, flags and connector selection resolving
  over platform defaults; connector contracts, deterministic `mock-sis`, registry health and
  capabilities, ordered imports, provenance upserts, stale-write guards, tombstones, child pruning,
  watermarks and a locked run state machine (ADR 0010); and reconciliation (37), which reads both
  sides live and reports what is missing, stale or in conflict per domain, resolving nothing.
- **Invited person records** — an import lands a person as `users.status = 'invited'` with no
  credential, and no longer throws `IDENTITY_EMAIL_CONFLICT` when the human self-registered first.
  `user_emails` separates an asserted address from a proven one; only a verified address is
  globally unique, and signing in at the institution's provider claims the record. ADR 0015 step (a).
- **Derived roles and the grant rules** (B13; narrows B2) — `student` derives from an active
  `program_membership` and `teacher`/`teaching_assistant` from a `teaching_assignments` row, so an
  imported person has permission the moment their academic record exists; neither is revocable
  through the grant screen. The grant screen offers only the five roles an academic record cannot
  express. `role:assign` is checked at the scope being granted or revoked on, not the institution;
  a caller may not hand out a role whose permissions exceed their own, and an institution's last
  `institution_admin` cannot be revoked. ADR 0016.
- **Connector credentials** (46) — a connector declares its fields; values are AES-256-GCM encrypted
  and never echoed back, behind `connector:configure` held by `institution_admin` alone (ADR 0014).
- **Student and teacher surfaces** (38–45, 47) — courses and a 360° course page; grades with the
  calculated/proposed/official stages and their provenance; a dashboard; the week calendar with exam
  terms as a second layer (ADR 0013); exam terms and controlled registration with the server
  answering why a seat is out of reach (ADR 0011); teaching offerings and rosters, where
  `enrollment:read` alone never opens a classmate list; the notification inbox with
  `type:subject:day` deduplication (ADR 0012); and sync monitoring behind `sync:run`.
- **Enrolment status is enforced** (B3) — `ENROLLMENT_PARTICIPATING_STATUSES` and
  `ENROLLMENT_RECORDED_STATUSES` sit beside the enum and are the only copies of the rule. Withdrawn,
  rejected and requested students no longer appear in _My courses_, the course page, the calendar,
  the roster or the teacher's count, and can no longer take an exam seat. `completed` deliberately
  still can, because that is the retake ladder.
- **Public surface** — a home page, three audience landings and `/contact` over
  `POST /api/v1/demo-requests`: unauthenticated, metered on its own site-wide budget, storing a lead
  under a hashed caller address and answering a constant `accepted`. Copy is written from the `Live`
  rows of `Feature Status.md`; nothing planned is claimed as shipped.
- **API, CI, navigation, deployment** — generated drift-checked `openapi.json`; lint, typecheck,
  coverage, build and security gates in both repositories; the app header, permission-gated
  institution tab bar, `/sign-up` and route protection; and a migration-aware deploy whose
  `/health/ready` fails when the database is behind the journal in the image.

## Not done — reviewed against the code on 2026-09-12

Two reviews, recorded in full with their evidence in `docs/Task Tracker.md`: _Gaps found outside
the backlog_ (G1–G12, things not built) and _Business-logic and user-flow defects_ (B1–B12, things
built to a rule the model does not enforce). `Feature Status.md` is corrected where a `Live` row
turned out not to be. Read those before starting; the headlines:

- **Onboarding is still the largest hole**, though narrower still. Steps (a) and (b) closed the
  watermark poisoning and gave imported people permission the moment their academic record exists,
  but there is still no invitation, no accept-and-claim, no merge and no password reset, so an
  imported person cannot sign in with a password (**B1**). The first `institution_admin` needs SQL,
  there is no institution creation, org-unit read or person directory, so a fresh account still has
  nowhere to go and an administrative role still has to be granted by typing a UUID
  (**B2** narrowed, **G6**, **G7**).
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
  (**G10**); GDPR, threat model, audit and export unstarted while personal data is already
  served (**G12**).
- Reconciliation deliberately skips `persons` — a person becomes a user and a linked identity
  rather than a provenanced canonical row — but the screen says nothing about the omission, so
  the largest imported domain is simply missing from a table that claims to compare both sides.
- Smaller, known: the calendar's course picker lists only courses with an event that week and no
  filter survives a reload; the account card omits Calendar, Exams and Teaching; no credential key
  rotation; configuration is read from PostgreSQL on every call; the legacy flat `RolesGuard` still
  governs the old user endpoints; theses and transcripts are intentionally out of the model.

## Deployment caveat — act on this first

Render's service must run `pnpm db:migrate:prod` as its **Pre-Deploy Command** and probe
`/health/ready`. Until it does, the hosted database has no schema and every query fails
with `relation "users" does not exist` — which is where it stood on 2026-08-29. Details in
`docs/Deployment.md`.

## Next task — onboarding step (c): institution creation, org-unit read, person directory

Read `adr/0015-accounts-and-institutional-membership.md` and
`adr/0016-administrative-authority.md` first; steps (a) the identity schema and (b) derived roles
and the grant rules both landed 2026-09-12 and the sequence continues from there.

**Take step (c)** (**G6**, **G7**). Today a tenant, its org units and its first `institution_admin`
grant exist only by hand-writing SQL, and a grant names its subject and scope by raw UUID because
there is no directory to look either up in. Build:

1. `POST /institutions` behind the platform-operator `RolesGuard` tier (ADR 0016), creating the
   institution and its first `institution_admin` invitation target.
2. Org-unit read: list and fetch org units within an institution, so a grant's scope field can be
   chosen rather than typed.
3. A person directory: list people within an institution (name, status, derived roles) behind
   `role:read` or a similar read permission, so a grant's subject can be chosen rather than typed.

This also retires the hand-edited demo data this loop has repeatedly needed to reach a screen —
worth fixing as part of this step if it falls out naturally, but do not let it become the step.

**Then, in order:** (d) invitations, accept-and-claim, merge and password reset, which closes B1.
Then **step 48's resolution half** behind an ADR on override-vs-winner; **G2**, a `mock-lms`
connector and the learning-domain importers, which no numbered step covers; **G1's write-back
ADR**; B4/B5/B9/B11 as one exam-lifecycle step; G4/G8 (grade entry); and B6 (make the flags
mean something).

## Caveats

- `Tasks Plan.md` and `System Plan.md` are research output and contain broken private-use
  citation markers; prefer the code, tracker and current practice.
- **B10 got sharper, not smaller.** The notification audience is still
  `ENROLLMENT_PARTICIPATING_STATUSES`, so a `completed` student who legitimately registers for a
  resit is never told when that term moves — the exam flow still disagrees with itself, now only
  for retakes. Fold this into the B10 fix.
- The roster's "{enrolled} enrolled of {total} listed" copy is now near-redundant: the server no
  longer sends rows that fail the count, so the two numbers match except against a stale cache.
  Worth collapsing to a single figure when that widget is next touched.
- Steps 1–22 were inferred from documents, not re-verified.
- The client bundle measures 444.8 kB gzipped against the 455 kB guard — step (b)'s derived-role
  badge and narrower grant form cost 3.9 kB. `pnpm size` is green with about 10 kB of headroom left;
  take the Radix Select swap before raising the guard, not before spending what remains.
- Listing derived roles is per person (`GET .../role-assignments?userId=`), not institution-wide:
  enumerating every derived membership across an institution needs a directory query this step did
  not build. Step (c)'s person directory is the natural place to add it.
- Local development needs uncommitted `.env` files, with the backend's ports matching what
  `docker-compose.yml` publishes (5432 / 6379). The dev seed creates two users and no institution;
  demo data needs an institution row, a role grant, `academicSystemConnector: mock-sis` and a run. Every
  walk so far has had to hand-edit that data to reach its screen. A seed producing a signed-in user with
  a plausible student _and_ teacher life would pay for itself — this is now the longest-standing tax on
  the loop.
