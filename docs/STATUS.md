# Status

Handoff note for the next agent. Keep it under ~100 lines; trim rather than append.

Last updated: 2026-09-19 (**the product pivoted — read ADR 0024 before anything else**)

## What this is

**A standalone academic platform that does the job AIS2 and Moodle do between them.** The
institution enters its own data and StudViro is where that data lives. There is no upstream.

That changed on 2026-09-18: it had been scoped as a surface _over_ those two systems and the
integration was never connected to anything. ADR 0024 records the decision and what it cost.
`docs/Product Plan.md` is the backlog; `Tasks Plan.md` and `Task Tracker.md` are superseded
research output kept for the record — believe their banners.

## Stack

NestJS 11 on Fastify · Drizzle + PostgreSQL 17 · Redis 7 · generated OpenAPI · Vitest +
Testcontainers. The client is Next.js 16 App Router with Feature-Sliced Design and acts as the
BFF. Decisions live in `docs/adr/`.

## Done

Detail in `docs/Task Tracker.md` and `docs/Feature Status.md`. In short:

- **Foundation** — modular monolith (ADR 0002), `ROLE=api|worker|all`, validated env, graceful
  shutdown, Pino correlation logs, health, metrics, BullMQ, Redis locks, idempotency; Drizzle
  migrations, transaction-mediated institution-scoped repositories, keyset pagination, soft
  deletion and 25 academic tables (ADR 0009).
- **Auth and authorization** — argon2 credentials, rotating JWT/refresh sessions (ADR 0003),
  canonical roles, scope ancestry, the permission catalogue, `PermissionsGuard` /
  `@RequirePermission`, and a platform-operator tier holding no academic permission (ADR 0016).
- **Onboarding and the grant rules** (ADRs 0015–0018) — `student` derives from an active
  programme membership and `teacher` from a teaching assignment, so neither is grantable by
  hand; `role:assign` is checked at the scope being granted on; an institution's last admin
  cannot be revoked. Institution creation, invitations, sign-up, password reset.
- **The student's year** — courses and a 360° course page; grades with calculated/proposed/
  official stages; a dashboard; the week calendar with exam terms and deadlines as layers
  (ADR 0013, 0021); exam terms and registration with the server answering why a seat is out of
  reach (ADR 0011); **self-service course enrolment**; the notification inbox with
  `type:subject:day` deduplication (ADR 0012).
- **The teacher's and registrar's year** — teaching offerings and rosters; **grade entry**
  behind `grade:propose` / `grade:publish`, checked separately, where publishing spends the
  attempt; **catalogue administration** of programmes, courses, offering capacity and status;
  the registrar's enrolment correction verb.
- **The rules mean what their enums say** — pass, fail and the 1–4 scale sit beside
  `COURSE_GRADES`; the retake ladder is enforced and explained; a resit is a second attempt
  rather than an overwrite; an annulled result has no standing; a cancelled term releases its
  seats; a cancellation is recorded rather than erased.
- **Eleven notification families** reaching the right people — a term that moves reaches the
  seat holders and the examiner, not everyone enrolled.
- **Institution configuration means something** — a feature flag closes the door and the
  navigation hides the tab; flags that gate nothing say so.
- **A demo university** — `pnpm db:seed` writes ~5,900 canonical rows so a fresh checkout
  has something to open (ADR 0025).
- **Public surface, API, CI, deployment** — home and audience landings, `/contact` over a
  metered `POST /api/v1/demo-requests`; generated drift-checked `openapi.json`; lint,
  typecheck, coverage, build and security gates in both repositories; migration-aware deploy.

## Next task — N2: org units and rooms an institution can create

**Phase 0 is done and N1 is done.** `pnpm db:seed` writes a whole demo university — ~5,900
rows, fifteen tables, about a second — so every screen has something on it. Sign in as
`ada@studviro.local` (student), `teacher@studviro.local`, `registrar@studviro.local` or
`admin@studviro.local`; the password is `correct horse battery staple` unless the account
already existed on this machine. ADR 0025 records what the seed is.

**N1 shipped**: `/institutions/:id/catalogue` now carries an _Academic terms_ card above the
programmes — list, create with an enrolment window, retire. Writes take `institution:manage`;
the card says of each term whether enrolment is open, opens later, closed, or never opens.

**Phase 1 of `Product Plan.md` is the live queue.** Its table carries a Status column now;
keep it current. What is left, in dependency order:

| #   | Missing               | Consequence                                                           |
| --- | --------------------- | --------------------------------------------------------------------- |
| N2  | Org units and rooms   | No faculties, no place to hold a class                                |
| N3  | Course offerings      | `PATCH` exists; there is no `POST`                                    |
| N4  | Teaching assignments  | Nobody can be made a course's teacher                                 |
| N5  | Programme memberships | **Nobody can be made a student — this blocks self-service enrolment** |
| N6  | Study groups          | No seminar or lab groups                                              |
| N7  | Timetable events      | `schedule:manage` still gates nothing                                 |
| N8  | Exam terms            | Students can register for exams nobody can create                     |
| N9  | Bulk entry            | A term's worth of offerings and people, pasted                        |

**N2 means**: `POST`/`PATCH`/`DELETE` for org units (a tree: university → faculty →
department) and for rooms, and an editing surface on `/institutions/:id/org-units`, which
today only reads. Org units are what a programme, a course and a room hang off, and a
scoped role grant points at one.

**After Phase 1, Phase 2 is the Moodle half** — file storage first, then learning spaces,
materials, assignments, submissions and marking. **L1 needs a decision from the user: which
object store, and whether it costs money.**

## Caveats

- The client bundle is at 442.13 kB gzipped against a 450 kB guard, and `pnpm size` is
  green — the breach recorded here on 2026-09-18 was closed by the integration removal.
  There is about 8 kB of headroom, so a large new screen will need the guard revisited.
- `/enroll` and `/exams` render the same card-and-reason shape twice, and
  `EnrollableOfferingCard` repeats `ExamTermCard`'s window and seats logic. One shared
  component would cover both.
- `pnpm db:seed` does not reset an existing user's password, deliberately. On this
  machine's dev database `admin@studviro.local` is `newpassword123`, not the seed default.
- The demo seed's anchor is fixed at 2026-10-15, which is what makes it deterministic. The
  seeded academic year is 2026/2027; once real time leaves it, move the anchor.
- The seed only deletes the institution it owns. Institutions created by hand during
  earlier sessions stay, and a user who belongs to both sees both in the institution
  switcher.
- `test/setup/global-setup.ts` reuses `DATABASE_URL` when it is set, and the e2e harness
  truncates every table. Running `pnpm test:e2e` against the dev database wipes it —
  re-seed afterwards.
- `UsersRepository.findInvitedByEmail` is not scoped to the inviting institution — two
  institutions inviting the same address would contend for one shadow row. See ADR 0018.
- The frontend dev server does not reliably hot-reload `messages/*.json` under Turbopack;
  restart it when a key renders as its raw identifier.
- **Importing a `@Global` module registers its `APP_GUARD` a second time, and the second
  registration denies everything.** `FeatureFlagGuard` is registered in `AppModule` for this
  reason. Worth a lint rule if it happens twice.
- `nest start --watch` does not release port 3010 on this machine: every reload after the
  first fails `EADDRINUSE` and **the previous build keeps serving**, which silently
  invalidates any live check. Kill the listener by pid when probing behaviour.
- What is left of **B4**: `no_show` and `excused` are never set — publishing a grade marks a
  seat `attended`, but nobody can record an absence. **B7**: terminology renders in the
  org-unit tree only. **B2**: there is still no request-to-join. **B8**: a term with no
  registration window is open for ever.
