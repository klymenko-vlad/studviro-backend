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

`pnpm db:seed` writes a whole demo university — ~7,000 rows across twenty tables, including
the learning half, with one assignment already marked and one still open. Sign in at `/sign-in` as:

| Who           | Email                      |
| ------------- | -------------------------- |
| Administrator | `admin@studviro.local`     |
| Registrar     | `registrar@studviro.local` |
| Teacher       | `teacher@studviro.local`   |
| Student       | `ada@studviro.local`       |

Password `correct horse battery staple` — **except** any account that already existed on this
machine, which keeps the password it had. `admin@studviro.local` here is `newpassword123`.

## Where the backlog stands

**`Product Plan.md` is complete. All thirty-three items, Phases 0 to 4, both halves of
each.** That document is now the record of what was built and why, not a queue.

- **Phase 0** — the integration removed, and the deleted dataset generator recovered as a
  demo seed (ADR 0025).
- **Phase 1** — the registry. An institution can be set up by hand from nothing: terms, org
  tree, rooms, programmes, courses, offerings, teaching assignments, programme memberships,
  study groups, timetables, exam terms, and bulk paste.
- **Phase 2** — the learning half. Object storage (ADR 0027), spaces, materials,
  assignments, submissions, marking (ADR 0028). Quizzes ruled out, with reasons.
- **Phase 3** — one timeline, study progress against the programme (ADR 0029), search,
  WCAG 2.2 AA, mobile, terminology overrides.
- **Phase 4** — GDPR inventory, DPIA, threat model, audit events (ADR 0026), export and
  erasure (ADR 0030), observability, backup with a real restore drill, authorization-negative
  tests, load tests with real numbers, accessibility tests, and two guides.

## What to do next

There is no next backlog item. What follows is what this session found and deliberately did
not do — each is a defect or a gap with evidence behind it, not a wish.

**1. An enrolment rush loses about a quarter of its writes.** `docs/Performance.md` has the
measured run: ~26% of a 144-student rush gets `409 SERIALIZATION_FAILURE`, and **nothing
retries it**. A bounded retry around `MyEnrollmentsService.request` is the fix. Note the
counter-intuitive part before touching it: raising `DATABASE_POOL_MAX` from 10 to 40 made it
_worse_ — 80.6% conflicts and twelve places left unsold. The small pool is accidental
admission control.

**2. A teacher cannot author their own learning space.** `offering:manage` is
institution-scoped while the derived `teacher` role is offering-scoped, so only a
coordinator can. It needs a scope-aware guard; ADR 0028 records it.

**3. The two guides predate the learning half and search.** `Administrator Guide.md` and
`User Guide.md` were written while L2–L6 and U3 were landing, so materials, assignments,
submissions, marking and the search box are missing from both.

**4. Smaller, all real:** `RefreshTokensRepository.purgeExpired` still has no scheduler, so
IP addresses and user agents accumulate; `DELETE /users/:id` is a soft delete that reads
like an erasure and now sits beside a real one; the person pickers list the whole directory
unfiltered and want a typeahead; and the bundle guard was raised to 540 kB for Phases 1–2
and should come back down now they have landed (it measures 506 kB).

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
