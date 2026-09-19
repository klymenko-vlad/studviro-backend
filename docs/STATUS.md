# Status

Handoff note for the next agent. Keep it under ~120 lines; trim rather than append.

Last updated: 2026-09-19

## What this is

**A standalone academic platform that does the job AIS2 and Moodle do between them.** The
institution enters its own data and StudViro is where that data lives. There is no upstream.

That changed on 2026-09-18: it had been scoped as a surface _over_ those two systems and the
integration was never connected to anything. **Read `adr/0024` first.** `docs/Product Plan.md`
is the live backlog; `Tasks Plan.md` and `Task Tracker.md` are superseded research output
kept for the record — believe their banners.

## Stack

NestJS 11 on Fastify · Drizzle + PostgreSQL 17 · Redis 7 · MinIO (S3-compatible) · generated
OpenAPI · Vitest + Testcontainers. The client is Next.js 16 App Router with Feature-Sliced
Design and acts as the BFF. Decisions live in `docs/adr/`.

## Start here

```
cd backend  && pnpm docker:up && pnpm db:migrate && pnpm db:seed && pnpm build && node dist/main.js
cd frontend && pnpm dev            # port 3001; the API is on 3010
```

`pnpm db:seed` writes a whole demo university — ~6,700 rows across twenty tables, including
the learning half. Sign in at `/sign-in` as:

| Who           | Email                      |
| ------------- | -------------------------- |
| Administrator | `admin@studviro.local`     |
| Registrar     | `registrar@studviro.local` |
| Teacher       | `teacher@studviro.local`   |
| Student       | `ada@studviro.local`       |

Password `correct horse battery staple` — **except** any account that already existed on this
machine, which keeps the password it had. `admin@studviro.local` here is `newpassword123`.

## Where the backlog stands

`docs/Product Plan.md` carries the live status column and is the source of truth. In short:

- **Phase 0 (remove the integration)** — done, R1–R7.
- **Phase 1 (the registry)** — done, N1–N9. **An institution can now be set up by hand from
  nothing**: academic terms, org tree, rooms, programmes, courses, offerings, teaching
  assignments, programme memberships, study groups, timetables, exam terms, and bulk paste
  for a term's worth of offerings or a cohort.
- **Phase 2 (the learning half)** — L1 storage done (ADR 0027), L2–L6 backends done (ADR
  0028), L7 decided: **no quizzes**, and why. The screens were the last thing in flight.
- **Phase 3** — U1, U4, U5 done. U2 and U3 have backends. **U6 is not started.**
- **Phase 4** — O1, O2, O5, O6, O7, O9 done. O3 has a backend. **O4 is not started.**

## What to do next

**1. Whatever `Product Plan.md` still shows as `Backend`.** Each is a screen over an endpoint
that already exists and is tested:

| #   | The endpoint that is waiting for a screen                   |
| --- | ----------------------------------------------------------- |
| U2  | `programmes[]` on `GET /institutions/:id/me/study-progress` |
| U3  | `GET /institutions/:id/search` — one box over everything    |
| O3  | `GET /institutions/:id/audit-events` — who changed what     |

**2. U6 — terminology overrides everywhere.** An institution can rename _faculty_, _student_,
_course_ and eight other words in its settings. Today the override renders **only in the
org-unit tree**. `useTerminology(institutionId)` already exists in
`frontend/src/entities/institution-configuration`; the work is applying it across the
screens and keying the strings that are still hard-coded English nouns.

**3. O4 — personal-data export and erasure. The largest correctness gap left.**
**ADR 0030 already settles the design; read it before writing code.** The urgency is in
`docs/GDPR Data Inventory.md`: **nothing in this system ever hard-deletes.**
`BaseRepository.hardDelete` has no caller outside refresh-token purging, every removal verb
is `softDelete`, so no `onDelete: 'cascade'` has ever fired and a "deleted" user keeps their
email, display name and password digest for ever. Erasure must also reach the object store —
ADR 0027 notes nothing deletes a file when the row referencing it goes.

## Standing decisions — do not re-ask these

- **Object storage**: Cloudflare R2 or AWS S3, both S3-compatible. MinIO runs in
  `docker compose` for development and CI. **No credentials are needed until deploy; do not
  create a bucket.** Four env vars switch targets — see `docs/Deployment.md`.
- **Local only.** Do not deploy, do not create hosted resources, do not spend money. Record
  what a release needs in `docs/Deployment.md` instead.
- **Institutional unknowns** (controller, DPO, retention, lawful basis) are `TODO(institution)`
  in a table at the top of each document. Do not invent them.
- **No quizzes** (ADR 0028).

## Traps that have cost time here

- **Regenerate both halves of the contract together.** A server returning a permission the
  client's generated Zod enum does not know makes every permissions response fail validation
  and every `can()` answer false — the app renders as if the caller had no rights. It looks
  exactly like a permissions bug. `pnpm openapi:generate` then `pnpm api:generate`.
- `nest start --watch` **does not release port 3010 on this machine**: every reload after the
  first fails `EADDRINUSE` and the previous build keeps serving, silently invalidating any
  live check. Build and run `node dist/main.js` when probing behaviour.
- `pnpm db:generate` wants a TTY when drizzle-kit disambiguates a rename:
  `script -qec "pnpm db:generate" /dev/null`.
- **Importing a `@Global` module registers its `APP_GUARD` a second time and the second
  registration denies everything.** `FeatureFlagGuard` lives in `AppModule` for this reason.
- The frontend dev server does not reliably reload `messages/*.json` under Turbopack. Restart
  it when a key renders as its own identifier.
- `test/setup/global-setup.ts` reuses `DATABASE_URL` when set and the harness truncates every
  table — `pnpm test:e2e` against the dev database wipes it. Re-seed after.
- **Do not bulk-edit with regex across many files.** It has silently eaten closing braces here.

## Caveats worth knowing

- The client bundle is ~480 kB against a **540 kB** guard, raised once for Phases 1 and 2 and
  **meant to be lowered back** now they have landed. The reduction `.size-limit.mjs` reserved
  was taken and measured at **zero bytes**; do not re-attempt it.
- **A teacher who is not a course coordinator cannot author their own learning space.**
  `offering:manage` is institution-scoped while the derived `teacher` role is
  offering-scoped. It needs a scope-aware guard; ADR 0028 records it.
- The person pickers on the teaching panel and the programme roll list the whole institution
  directory unfiltered — 170-odd names after the seed. They want a typeahead. Neither can
  filter by role, because a teacher need not hold one.
- A `requested` enrolment holds no place, so it is not on the roster and cannot join a study
  group. On a term that has not started every enrolment is `requested`.
- The seed's anchor is fixed at 2026-10-15 to stay deterministic; the seeded year is
  2026/2027. **Move the anchor once real time leaves it.** It deletes only the institution it
  owns, and never resets an existing user's password.
- `shared/ui`'s `Select` wraps the native control in a `w-fit` container, so `w-full` on the
  control does nothing. Every select in the app is natural width.
- `UsersRepository.findInvitedByEmail` is not scoped to the inviting institution — two
  institutions inviting one address contend for a single shadow row. See ADR 0018.
- What is left of **B4**: `no_show` and `excused` are never set — publishing a grade marks a
  seat `attended`, but nobody can record an absence. **B2**: still no request-to-join.
