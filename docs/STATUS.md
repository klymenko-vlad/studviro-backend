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

## Next task — N8: exam terms an institution can create

**Phase 0 and N1–N7 are done**, and so are **O1, O2, O6** and the backend of **O3**.
`pnpm db:seed` writes a whole demo university. Sign in as `ada@studviro.local` (student),
`teacher@studviro.local`, `registrar@studviro.local` or `admin@studviro.local`; the
password is `correct horse battery staple` unless the account already existed here.

**An institution can now be set up by hand from nothing**: terms, org tree and rooms,
programmes and courses, offerings, teachers, students, seminar groups and a timetable.

- **N1** _Academic terms_ · **N2** org tree + _Rooms_ · **N3** _Course offerings_ ·
  **N4** teaching staff · **N5** `/institutions/:id/programs/:programId` ·
  **N6** _Groups_ · **N7** _Timetable_ — all on the catalogue or offering page.
- **O1/O2** — `docs/GDPR Data Inventory.md`, `docs/DPIA.md`, `docs/Threat Model.md`.
  Every institutional unknown is marked `TODO(institution)` in a table at the top of each.
- **O3** — `audit_events` and `GET /institutions/:id/audit-events` behind `audit:read`
  (ADR 0026). **No screen reads it yet** — that is the rest of O3.
- **O6** — `pnpm db:backup` / `pnpm db:restore`, `docs/Backup and Restore.md`, with a
  restore drill actually performed and its numbers recorded.

**Phase 1 of `Product Plan.md`** has two left:

| #   | Missing    | Consequence                                       |
| --- | ---------- | ------------------------------------------------- |
| N8  | Exam terms | Students can register for exams nobody can create |
| N9  | Bulk entry | A term's worth of offerings and people, pasted    |

**N8 means**: create, move, cancel and set the capacity and registration window of an
`exam_term` on an offering, under `schedule:manage`. Everything on the student's side
already exists — registration, the retake ladder, the seat-release on cancellation
(`ExamTermCancellationService`, which now also writes an audit event). Reuse that service
for the cancel verb rather than writing a second one.

**Phase 2 is the Moodle half** and **L1 is decided**: Cloudflare R2 or AWS S3, so build one
S3-compatible client behind a `StorageService`, run MinIO in `docker-compose` for local and
CI, and take bucket, region, endpoint and credentials from the environment. **No
credentials are needed until deploy**; do not create a bucket.

**The user has ruled: local only.** Do not deploy, do not create hosted resources, do not
spend money.

## Caveats

- The client bundle is at 468.18 kB against a **540 kB** guard, raised once for the whole
  of Phase 1 and Phase 2 and to be lowered back when they land. The reduction
  `.size-limit.mjs` reserved — sharing one card between `/enroll` and `/exams` — was taken
  and measured at **zero bytes**; it is kept as better code. Do not re-attempt it.
- `pnpm arch` was red on `dev` before this session for a widget-to-widget import; it is
  green now. `offering-grades` was folded into `course-offering`, the only widget that
  rendered it.
- The person pickers on the teaching panel and the programme roll offer the whole
  institution directory — 170-odd names once the demo seed has run, unfiltered and
  unsearchable. Neither can filter by role (a teacher need not hold one), so what they
  want is a typeahead. Worth a step.
- **Adding a permission to the catalogue breaks a stale client silently.** The generated
  client validates responses against a Zod enum, so a server returning `audit:read` before
  `pnpm api:generate` has run makes every permissions response fail validation and every
  `can()` answer false — the app renders as if the caller had no rights. `pnpm openapi:check`
  catches the drift in CI; at runtime it looks like a permissions bug. Regenerate both
  halves together.
- A `requested` enrolment holds no place, so it is not on the roster and cannot be put in
  a study group. On a term that has not started every enrolment is `requested`, which is
  why the demo's summer offerings show a roster of zero against a seat count of eight.
- `shared/ui`'s `Select` wraps the native control in a `w-fit` container, so `className="w-full"`
  on the control does nothing. Every select in the app is natural width.
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
