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

## Next task — the frontend halves that are outstanding

**Phase 1 is complete.** An institution can be set up by hand from nothing: academic terms,
org tree and rooms, programmes and courses, offerings, teaching assignments, programme
memberships, study groups, timetables, exam terms, and bulk entry for a term's worth of
either. `pnpm db:seed` writes a demo university to look at. Sign in as
`ada@studviro.local` (student), `teacher@studviro.local`, `registrar@studviro.local` or
`admin@studviro.local`; the password is `correct horse battery staple` unless the account
already existed here.

**What is done, by phase:**

- **Phase 0** — R1–R7. **Phase 1** — N1–N9, all with screens.
- **Phase 2** — L1 (object storage, ADR 0027). L2–L7 were in flight when this was written;
  check `Product Plan.md` for their real state.
- **Phase 3** — U1 was already done. U2 and U3 have backends and **no screen yet**.
- **Phase 4** — O1, O2, O5, O6, O7 done. O3 has a backend and **no screen yet**.

**The outstanding work is mostly frontend halves**, and each is small on its own:

| #   | What is missing                                                              |
| --- | ---------------------------------------------------------------------------- |
| U2  | A screen reading the `programmes` array now on `GET .../me/study-progress`   |
| U3  | A search box reading `GET /institutions/:id/search`                          |
| U6  | Terminology overrides render in the org-unit tree only; everywhere else next |
| O3  | A screen reading `GET /institutions/:id/audit-events`                        |
| O4  | Personal-data export and erasure — **not started, and the largest one left** |

**O4 is the one with teeth.** `docs/GDPR Data Inventory.md` records the finding that makes
it urgent: **nothing in this system ever hard-deletes.** `BaseRepository.hardDelete` has no
caller outside refresh-token purging, every removal verb is `softDelete`, so no
`onDelete: 'cascade'` has ever fired and a "deleted" user keeps their email, display name
and password digest indefinitely. Erasure must also reach the object store — ADR 0027 notes
that nothing yet deletes a file when the row referencing it goes.

**The user has ruled: local only.** Do not deploy, do not create hosted resources, do not
spend money. **L1 is decided**: Cloudflare R2 or AWS S3; MinIO runs in `docker compose` for
development and CI, and no credentials are needed until deploy. **O1/O2 are decided**: every
institutional unknown is a `TODO(institution)` in a table at the top of each document.

## Caveats

- The client bundle is at 477 kB against a **540 kB** guard, raised once for Phase 1 and
  Phase 2 and to be **lowered back when they land**. The reduction `.size-limit.mjs`
  reserved was taken and measured at **zero bytes**; do not re-attempt it.
- **Regenerate both halves of the contract together.** A server returning a permission the
  client's generated Zod enum does not know makes every permissions response fail
  validation and every `can()` answer false — the app renders as if the caller had no
  rights. `pnpm openapi:check` catches it in CI; at runtime it looks like a permissions bug.
- **Nothing ever hard-deletes.** See O4 above; this is the largest correctness gap left.
- The person pickers on the teaching panel and the programme roll list the whole
  institution directory unfiltered — 170-odd names after the demo seed. They want a
  typeahead. Neither can filter by role, because a teacher need not hold one.
- `pnpm db:seed` never resets an existing user's password, deliberately. On this machine
  `admin@studviro.local` is `newpassword123`, not the seed default. The seed's anchor is
  fixed at 2026-10-15 to stay deterministic; the seeded year is 2026/2027, so move the
  anchor once real time leaves it. It deletes only the institution it owns.
- A `requested` enrolment holds no place, so it is not on the roster and cannot join a
  study group. On a term that has not started every enrolment is `requested`, which is why
  the demo's summer offerings show a roster of zero against eight seats.
- `test/setup/global-setup.ts` reuses `DATABASE_URL` when set and the harness truncates
  every table — running `pnpm test:e2e` against the dev database wipes it. Re-seed after.
- **Importing a `@Global` module registers its `APP_GUARD` a second time and the second
  registration denies everything.** `FeatureFlagGuard` lives in `AppModule` for this reason.
- `nest start --watch` does not release port 3010 on this machine: every reload after the
  first fails `EADDRINUSE` and **the previous build keeps serving**, silently invalidating
  any live check. Build and run `node dist/main.js` when probing behaviour.
- `pnpm db:generate` wants a TTY when drizzle-kit disambiguates a rename. Run it as
  `script -qec "pnpm db:generate" /dev/null`.
- `shared/ui`'s `Select` wraps the native control in a `w-fit` container, so `w-full` on
  the control does nothing. Every select in the app is natural width.
- `UsersRepository.findInvitedByEmail` is not scoped to the inviting institution — two
  institutions inviting one address contend for a single shadow row. See ADR 0018.
- The frontend dev server does not reliably reload `messages/*.json` under Turbopack;
  restart it when a key renders as its own identifier.
- What is left of **B4**: `no_show` and `excused` are never set — publishing a grade marks
  a seat `attended`, but nobody can record an absence. **B2**: still no request-to-join.
