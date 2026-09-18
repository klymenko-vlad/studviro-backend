# Status

Handoff note for the next agent. Keep it under ~100 lines; trim rather than append.

Last updated: 2026-09-18 (the notification families land — G9 closed, B10 and B12 fixed)

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
- **Auth and authorization** — argon2 credentials, rotating JWT/refresh sessions (ADR 0003),
  linked-identity provisioning, canonical roles, scope ancestry, the permission catalogue,
  `PermissionsGuard` / `@RequirePermission`, and a separate platform-operator `RolesGuard` tier
  that holds no academic permission (ADR 0016). OIDC is blocked on institutional registration.
- **Institution setup and synchronization** — terminology, flags and connector selection resolving
  over platform defaults; connector contracts, deterministic `mock-sis`, registry health and
  capabilities, ordered imports, provenance upserts, stale-write guards, tombstones, child pruning,
  watermarks and a locked run state machine (ADR 0010).
- **Reconciliation** (37, 48) — reads both sides live and reports what is missing, stale or in conflict
  per domain, then settles one either way: `accept_source` marks the row pending so the next import
  overwrites it, or tombstones it when the source dropped it; `keep_platform` detaches the row so no
  import can ever match it again. A record the platform never took in is not resolvable there, because
  the remedy is an import. Every decision is logged in `reconciliation_resolutions` with who made it.
  **Both halves are covered**: the source system is a parameter the way it is for a sync run, so
  `?sourceSystem=lms` resolves the learning connector and walks the six learning domains, and the
  domain alone decides which source owns a row — resolution is never told, so it cannot be told
  wrongly. Every message that said "a full synchronization" names which system's run would settle it.
  A _System_ picker sits beside the check button, and the screen says people are compared by neither.
  Behind `sync:run`. ADR 0019.
- **The learning half of the model** (G2, partly) — a deterministic `mock-lms` derives one learning
  space per `mock-sis` course offering, naming it by the SIS identifier, with activities whose
  assessable types carry `opens_at`/`due_at`. Two sync domains (`learningSpaces`,
  `learningActivities`) and two importers land them; an LMS run is the same sync run under
  `sourceSystem: 'lms'`, taking its own lock and its own in-flight check, chosen from a _System_
  picker beside the mode picker on the sync screen. `/institutions/[id]/learning` lists what
  arrived with activity counts, next deadline and the offering each is matched to. ADR 0020.
- **Deadlines reach the student** (G3) — `GET .../me/deadlines` answers the same range the calendar
  asks for, behind `schedule:read`, scoped to the offerings the caller participates in or teaches and
  skipping anything the LMS marked invisible. The week calendar carries them as a third layer with its
  own toggle, the dashboard as a two-week tile, and the LMS import announces a new or moved one as
  `assignment_due_published` / `assignment_due_rescheduled` through the emitter ADR 0012 built — same
  `type:subject:day` window, same offering audience. ADR 0021.

- **A registration reaches the university** (G1, step 1 of 3 — ADR 0023) — `source_write_intents` is an
  outbox written in the same serializable transaction as the registration, gated on the connector declaring
  `examRegistration.write`, drained by a `writeBack` job on the `synchronization` queue with the intent id as the
  idempotency key. Acknowledgement stamps `source_system` and `external_id` on the row so the next import matches
  rather than duplicating it; a `ConnectorRejectedError` stops the intent and withdraws the registration; a
  transport failure backs off five times and then stops as `abandoned`, compensating nothing, because nobody knows
  whether it landed. `tombstoneMissing` — which tombstoning _and_ child pruning both go through — never deletes a
  row with a live intent. `mock-sis` writes both commands and refuses a retake deterministically, so the refusal
  path is walkable. The exam card names the delivery state; the sync monitor lists every unacknowledged write with
  retry and discard behind `sync:run`. No new permission.

- **The exam lifecycle means what its enums say** (B4, B5, B9, B11) — pass, fail and the 1–4 point
  scale sit beside `COURSE_GRADES` as the only copies of the rule, and `EXAM_TERM_KIND_ORDER` gives the
  retake ladder its rungs: a `first_retake` needs one failed official result on the offering behind it,
  a `second_retake` two, refused on the write and explained on the read as `attempt_not_earned`.
  `official_course_results` is unique per (enrolment, attempt), so a resit no longer overwrites the
  failure that made it necessary. An annulled result has no effective grade and says so
  (_No standing_). Cancelling a term releases the seats it held, so the replacement is registrable.
  A cancellation is recorded rather than erased — the unique index is partial on
  `status = 'registered'` — and the card says you cancelled it. `GET .../me/course-results/summary`
  totals credits, the weighted average and the courses awaiting a resit, and the client's own copy of
  that arithmetic is gone.

- **Grades have a writer** (G8; narrows G4) — `GET .../course-offerings/:id/results` lists every
  recorded student with each attempt they hold, behind `grade:read` and the standing the roster asks
  for. `PUT .../results/:enrollmentId` proposes behind `grade:propose` and publishes behind
  `grade:publish`, checked separately so a teaching assistant may propose and may not publish. A second
  publication of one attempt becomes `corrected`, an annulled attempt cannot be revived, and a resit is
  recorded by naming the next attempt. **Publishing marks the student's live seat `attended`** — the
  only thing in the product that ever spends an attempt, which is the piece B4 left open. Editing a row
  the registrar owns marks it `pending`, so write-back step 3 has something to push.

- **The inbox says what actually happened** (G9; fixes B10 and B12) — nine more families: a grade
  published or corrected (from grade entry and from the importer, which finds the recipient through the
  enrolment), an enrolment confirmed or refused, a class moved or cancelled, and your own exam
  registration confirmed, cancelled or refused by the university with the reason it gave. The emitter
  takes an explicit recipient list, because a grade concerns one person. **A term that moves or is
  cancelled now reaches the people holding a seat and the examiner**, not everyone enrolled — so a
  `completed` student sitting a resit is told, and the examiner hears at all; a newly _published_ term
  still goes to everyone enrolled, because that is who could sit it.

- **Onboarding, identity and the grant rules** (ADRs 0015–0018; **closes B1**, narrows B2) — an import
  lands a person as `users.status = 'invited'` with no credential and `user_emails` separates an
  asserted address from a proven one; `student` derives from an active `program_membership` and
  `teacher`/`teaching_assistant` from a `teaching_assignments` row, so an imported person has
  permission the moment their academic record exists, and neither is grantable or revocable by hand;
  `role:assign` is checked at the scope being granted on, nobody may hand out a role exceeding their
  own, and an institution's last `institution_admin` cannot be revoked. A platform operator creates an
  institution and its first admin at `/institutions/new`; `role:read` gates an org-unit tree and a
  person directory. An admin invites an address behind `role:assign`; the single-use, 7-day,
  SHA-256-hashed token is accepted at `/sign-up?invitation=<token>`, which promotes a shadow in place,
  attaches the grant to an active account, or merges the two in one transaction. `/forgot-password`
  and `/reset-password` cover the reset side with the same non-enumeration shape.
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

- **Onboarding is closed as far as this backlog runs it.** Steps (a)–(d) closed the watermark
  poisoning, gave imported people permission the moment their academic record exists, let a
  platform operator create an institution without SQL, and let an invited or self-registered
  person actually sign in (**B1** closed). What remains of **B2**: nobody can reach an institution
  without an invitation or a platform operator naming them — there is still no request-to-join.
- **Rules that exist only as enums.** What is left of **B4**: `no_show` and `excused` are still never
  set — publishing a grade marks a seat `attended`, but nobody can record an absence. All seven feature
  flags gate nothing (**B6**) and terminology overrides are never rendered (**B7**).
- **Not built at all.** **G1 is one third built**: exam registration reaches the source, the LMS pair
  (`learning_space.provision`, `learning_enrollment.upsert`) and `course_result.publish` are steps 2 and 3.
  **G8 is closed** and **G4** is down to six permissions with no endpoint — no catalogue
  administration and no enrolment correction; no self-service enrolment (**G5**); no sync schedule (**G10**); GDPR, threat model, audit and export unstarted while personal data is
  already served (**G12**).
- **G2 is closed**, and so is the reconciliation gap it left behind. What G2 did not settle: an LMS mark
  deliberately does not feed the calculated stage of `course_results` (ADR 0022), and grade entry is still G4/G8.
- **A refused write-back now says so.** The compensation announces itself as
  `exam_registration_refused`, carrying the reason the source gave, which closes the one cost ADR 0023
  named.
- `accept_source` is still a two-step operation: it clears the way, and a **full** run applies it. Until a
  scheduled sync exists (**G10**) the second step is a button somebody must remember to press — but the
  row now re-reports as a decision awaiting that run rather than as a fresh conflict.
- Smaller, known: the calendar's course picker lists only courses with an event that week and no
  filter survives a reload; the account card omits Calendar, Exams and Teaching; no credential key
  rotation; configuration is read from PostgreSQL on every call; the legacy flat `RolesGuard` now
  governs exactly `POST /institutions` and nothing else canonical; theses and transcripts are
  intentionally out of the model.

## Deployment caveat — act on this first

Render's service must run `pnpm db:migrate:prod` as its **Pre-Deploy Command** and probe
`/health/ready`. Until it does, the hosted database has no schema and every query fails
with `relation "users" does not exist` — which is where it stood on 2026-08-29. Details in
`docs/Deployment.md`.

## Next task — write-back step 2: the LMS pair

**`learning_space.provision` and `learning_enrollment.upsert`, which is where provisioning stops being
a column nobody writes (`enrollments.lms_provisioned_at`).**

The outbox, the worker, the capability gate, the retry ladder and the monitor surface all exist and are
kind-agnostic; this step adds two writers and the `mock-lms` commands they call.

What it takes:

- `LearningSystemConnector` gains `provisionCourse` and `upsertEnrollment` with an idempotency key and
  an acknowledgement carrying the identifier the LMS assigned, the same shape the academic pair has.
  `course.provision` and `enrollment.write` are already in `LEARNING_SYSTEM_CAPABILITIES`.
- Two `IntentWriter`s registered in `WriteBackModule`, targeting `lms` rather than `sis`.
- What _originates_ a provisioning intent: an offering with no learning space, and an active enrolment
  with no `lms_provisioned_at`. Unlike the exam pair there is no user act to hang it on, so decide
  whether a sync run enqueues them or an administrator asks for it on the sync screen. That is the one
  real design question in this step.
- `mock-lms` implements both, with a deterministic refusal so the `rejected` path stays walkable.
- Acknowledgement stamps `lms_provisioned_at` and the space's external id.

**After that, in order:** write-back step 3 (`course_result.publish` — G8 has given it something to
publish); B6 (make the seven feature flags gate something); B7 (render terminology overrides); G5
(self-service enrolment); the rest of G4 (catalogue administration, enrolment correction); G10 (a sync
schedule); G12 (GDPR inventory, threat model, audit events, export).

## Caveats

- **The write-back unique index is on one _queued_ intent per row, not one live one.** ADR 0023 says
  both "one live intent" and "the new intent is queued behind it", which cannot both hold; the index
  is `where state = 'pending'`, so an `in_flight` intent and a fresh `pending` one coexist and a
  cancel cannot overtake its own registration. Worth folding back into the ADR.
- **A refused _cancellation_ reverses nothing.** ADR 0023 names the compensation for a refused
  `create`; for a refused `cancel` the student has already cancelled here, and un-cancelling because
  the registrar refused the message would be the worse lie. It stays a stuck write on the monitor.
- **Nothing sweeps the outbox.** A `pending` intent whose BullMQ job was lost waits for a human to
  press Retry, because the delayed re-enqueue is the only thing that wakes the worker. A sync
  schedule (**G10**) is where a sweeper belongs.

- `Tasks Plan.md` and `System Plan.md` are research output and contain broken private-use
  citation markers; prefer the code, tracker and current practice.
- **B10 got sharper, not smaller.** The notification audience is still
  `ENROLLMENT_PARTICIPATING_STATUSES`, so a `completed` student who legitimately registers for a
  resit is never told when that term moves — the exam flow still disagrees with itself, now only
  for retakes. Fold this into the B10 fix.
- Steps 1–22 were inferred from documents, not re-verified.
- **The client bundle is at 444.36 kB gzipped against the 455 kB guard — 10.64 kB of headroom.**
  G1 step 1 spent 3.31 kB, the step before it 0.46 kB, then 1.72 kB, G3 2.61 kB, G2 2.67 kB. When choosing a
  `shared/ui` primitive, remember the native-`<select>` swap that freed 27.61 kB: a Radix control pulls
  in floating-ui, focus-scope, dismissable-layer and the collection helpers, and a plain HTML element
  sometimes covers the same behaviour for less.
- **Switching the reconciliation _System_ picker blanks the report until you press Check again.** The
  query is keyed by source system and starts disabled, so the new key simply has no data yet. It is
  coherent — it never re-labels the old answer as the new one — but it reads as the report vanishing.
  A line saying "press Check to compare this system" would cost nothing.
- `admin@studviro.local`'s password on this machine's dev database is `newpassword123`, not the
  seed default; `pnpm db:seed` does not reset an existing user's password.
- `UsersRepository.findInvitedByEmail` (step (d)) is not scoped to the inviting institution — two
  institutions importing the same address before either invites it would contend for one shadow
  row. Not reachable with the current single-tenant seed; see ADR 0018.
- A merge's unique-constraint collision (the survivor already holds the exact row the shadow held)
  fails the whole accept transaction rather than resolving it — the safer failure, not the
  friendliest. See ADR 0018.
- The dev seed creates two users, one a platform operator (`admin@studviro.local`), and no
  institution; a walk creates its own through the UI via that seeded operator.
- The frontend dev server does not reliably hot-reload `messages/*.json` under Turbopack; restart it
  when a new translation key renders as its raw identifier.
- For a student-side walk, `veronika.gajdos0128@mocku.example` (`walkwalk123`) is an imported student
  whose password was set directly in the dev database — there is still no request-to-join (**B2**).
- **Importing a `@Global` module registers its `APP_GUARD` a second time, and the second registration
  denies everything.** Adding `AuthorizationModule` to `InstitutionsModule.imports` made every
  `@RequirePermission` route answer `PERMISSION_DENIED` before `AuthorizationService` was ever called —
  for a platform operator as much as for a student. The module is `@Global`, so the import was never
  needed. Found during this walk; worth a lint rule if it ever happens twice.
- A deadline card still shows a bare time (`Due 12:00 AM` for a `due_at` that is an evening in UTC read
  in the institution's timezone). The day heading above carries the date, but the card alone does not.
- `nest start --watch` does not release port 3010 on restart on this machine: every reload after the
  first fails `EADDRINUSE` and the **previous build keeps serving**, which silently invalidates any
  live check. Kill the listener by pid, or build and run `node dist/main.js`, when probing behaviour.
