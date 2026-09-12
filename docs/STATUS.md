# Status

Handoff note for the next agent. Keep it under ~100 lines; trim rather than append.

Last updated: 2026-09-12 (password-reset screen)

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
  watermarks and a locked run state machine (ADR 0010); and reconciliation (37), which reads both
  sides live and reports what is missing, stale or in conflict per domain, resolving nothing.
- **Invited person records** — an import lands a person as `users.status = 'invited'` with no
  credential, and no longer throws `IDENTITY_EMAIL_CONFLICT` when the human self-registered first.
  `user_emails` separates an asserted address from a proven one; only a verified address is
  globally unique, and signing in at the institution's provider claims the record. ADR 0015 step (a).
- **Derived roles and the grant rules** (B13; narrows B2) — `student` derives from an active
  `program_membership` and `teacher`/`teaching_assistant` from a `teaching_assignments` row, so an
  imported person has permission the moment their academic record exists; neither is revocable
  through the grant screen, which offers only the five roles an academic record cannot express.
  `role:assign` is checked at the scope being granted or revoked on, not the institution; a caller
  may not hand out a role whose permissions exceed their own, and an institution's last
  `institution_admin` cannot be revoked. ADR 0016.
- **Institution creation, org units and the person directory** (G6, G7; narrows B2 further) — a
  platform operator creates an institution and its first `institution_admin` in one call at
  `/institutions/new`; `role:read` gates a browsable org-unit tree and a person directory merging
  granted and institution-wide derived roles. No more hand-written `INSERT` to reach a screen.
  ADR 0017.
- **Invitations, accept-and-claim, merge, self-service password reset** (step (d); **closes B1**,
  narrows B2 further) — an institution admin invites an address behind `role:assign` at
  `/institutions/[id]/roles`; the single-use, 7-day, SHA-256-hashed token is accepted at
  `/sign-up?invitation=<token>`, which either promotes an `invited` shadow in place, attaches the
  grant to an already-active account, or merges the two in one transaction when both exist under
  the same address, repointing every table that owns a `user_id`. `POST /institutions` accepts
  `firstAdminEmail` alongside `firstAdminUserId`, issuing an invitation instead of an immediate
  grant (ADR 0018). `/forgot-password` (linked from `/sign-in`) and `/reset-password` cover the
  reset side with the same non-enumeration shape and one message for an expired, consumed or
  malformed token; neither route requires a session. Fitting it meant swapping `shared/ui`'s
  `Select` from `@radix-ui/react-select` to a native `<select>`, recovering 27.61 kB of the client
  bundle before the new screens spent 5.63 kB of it back — see _Caveats_.
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
  no enrolment correction (**G4**, **G8**); no self-service enrolment (**G5**); one notification
  family (**G9**); no sync schedule (**G10**); GDPR, threat model, audit and export unstarted
  while personal data is already served (**G12**).
- Reconciliation deliberately skips `persons` — a person becomes a user and a linked identity
  rather than a provenanced canonical row — but the screen says nothing about the omission.
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

## Next task — step 48's resolution half

**Take step 48's resolution half**, behind an ADR on override-vs-winner: the read half already
ships (step 37, the sync monitor's discrepancy report); this step adds the write that resolves a
discrepancy, either by platform override or by marking one side the winner, and the drill-down that
acts on one from the report.

**After that, in order:** **G2**, a `mock-lms` connector and the learning-domain importers, which no
numbered step covers; **G1's write-back ADR**; B4/B5/B9/B11 as one exam-lifecycle step; G4/G8
(grade entry); and B6 (make the flags mean something). Wiring the person directory into the grant
form as a picker (rather than a raw UUID field) is small and falls out naturally whenever that
screen is next touched.

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
- **The client bundle is at 431.47 kB gzipped against the 455 kB guard — 23.53 kB of headroom.**
  The native-`<select>` swap freed 27.61 kB; the password-reset screens spent 5.63 kB back. The
  swap touched six call sites and their tests (role granting, invite-person, the schedule filters,
  the two institution-settings field groups, the sync mode picker) — worth remembering when a
  future `shared/ui` primitive is chosen: a Radix control pulls in floating-ui, focus-scope,
  dismissable-layer and the collection helpers, and a plain HTML element sometimes covers the
  same behaviour for less.
- Signing in as `admin@studviro.local` during this step's browser walk exercised the reset flow
  for real: its password on this machine's dev database is now `newpassword123`, not the seed
  default. `pnpm db:seed` does not reset an existing user's password.
- `UsersRepository.findInvitedByEmail` (step (d)) is not scoped to the inviting institution — two
  institutions importing the same address before either invites it would contend for one shadow
  row. Not reachable with the current single-tenant seed; see ADR 0018.
- A merge's unique-constraint collision (the survivor already holds the exact row the shadow held)
  fails the whole accept transaction rather than resolving it — the safer failure, not the
  friendliest. See ADR 0018.
- The dev seed creates two users, one a platform operator (`admin@studviro.local`), and no
  institution; a walk now creates its own institution through the UI in seconds via that seeded
  operator. The remaining tax: no seeded institution has `academicSystemConnector: mock-sis` or a
  sync run, so exercising student/teacher screens still needs that set up by hand.
- The frontend dev server does not reliably hot-reload `messages/*.json` under Turbopack; a
  restart was needed mid-walk to pick up a new translation key.
