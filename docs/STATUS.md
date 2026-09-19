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

**`Product Plan.md` is complete — all thirty-three items, Phases 0 to 4, both halves of
each.** It is the record of what was built and why, not a queue: the integration removed
and the dataset generator recovered as a demo seed (Phase 0, ADR 0025); the registry an
institution sets up by hand from nothing (Phase 1); the learning half (Phase 2, ADRs 0027
and 0028); one timeline, study progress, search, WCAG 2.2 AA, mobile and terminology
(Phase 3, ADR 0029); and the compliance, observability, backup, load, accessibility and
guide work of Phase 4 (ADRs 0026 and 0030).

The defect list this section used to carry has been worked through. What was found and
fixed on 2026-09-19:

- **The enrolment rush no longer loses a quarter of its writes.**
  `TransactionHost.runSerializable` replays a lost serialisation race three times with
  jittered backoff, on enrolment and exam registration both. Re-measured with the same k6
  profile: conflicts fell from 25.7% to **4.2%** and 21.9% to **2.5%**, capacity still
  respected. The requests that stopped being conflicts became honest `OFFERING_FULL`
  answers. `docs/Performance.md` has the numbers.
- **A teacher can use the product at all.** Signing in as the seeded teacher showed one
  dead navigation entry and "you hold a role here, but not one that lets you read courses
  or grades" — because teaching derived only offering-scoped roles while one programme
  membership derived an institution-scoped one for a student. Teaching now derives a role
  at the institution too, an assistant deriving `teaching_assistant` rather than `teacher`
  so the publish decision is still withheld. **ADR 0031**, which supersedes ADR 0028's
  guess at this.
- **A teacher authors their own course page.** The learning authoring routes moved from
  `offering:manage` to `offering:read`, with `LearningAccessService` deciding whose course
  it is — a check that already existed and already counted the offering's teacher as its
  author. Walked in a browser: saved on their own course, 403 on somebody else's.
- **Expired tokens are swept nightly.** `RefreshTokensRepository.purgeExpired` had no
  caller, so every sign-in's IP address and user agent accumulated for ever;
  `password_reset_tokens` had no sweep at all. Both now run daily.
- **`DELETE /users/:id` is named `deactivateUser`** and says in its own description that it
  is not the erasure it sits beside.
- **The person pickers are a typeahead**, matching name and email in any order, keyboard
  complete. The seed has two people called Dana Gajdoš, which is why the address is shown.
- **A student can read the feedback written with their mark.** It was stored, returned and
  never rendered.

## What to do next

The backlog is complete and so is the defect list it ended with. What follows is found
work, in the order it is worth doing. Each is a real gap with evidence, not a wish.

**Next task — wire the two notification services that have no callers.**
`LearningActivityNotificationsService` and `TimetableNotificationsService` both exist, are
both tested, and **neither is injected anywhere**: `grep` finds them only in their own
definition and in `notifications.module.ts`. So nobody is told when an assignment is set,
moved or marked, or when a class is moved or cancelled. The calendar carries those events
and the notifications list does not, which reads as a broken notifications feature rather
than a missing one. The call sites are `assignments.service.ts`,
`submission-marking.service.ts` and the timetable services; the notification families and
the aggregation rules already exist (ADR 0012).

Then, in order:

1. **Deleting a material or a submission orphans its object in the store.** Only erasure
   calls `StorageService.delete`. Every removed file is paid for for ever.
2. **`/institutions/:id/learning` is a leftover.** It lists every space institution-wide
   and reports how many are "matched to a course offering" — but a space is now authored
   against one, so the unmatched half cannot occur. Its nav entry is gated on
   `offering:read`, which every student holds, so students are offered the tab.
3. **The Slovak translation.** Both catalogues are fully keyed; 1,316 of 1,457 Slovak
   values are still the English string. The keys awaiting translation are exactly those
   whose `sk` value equals its `en` value, so the pass is mechanical to scope.
4. **Paginate the person directory.** `GET /institutions/:id/people` returns everybody,
   unpaginated. The pickers in front of it are a typeahead now, so this is about the
   payload rather than the interface. The grant form on `/roles` still takes a raw user
   id and never got the picker.
5. **Stale comments that now mislead.** `my-enrollments.controller.ts:67` and
   `my-enrollments.service.ts:27` still say a place stays `requested` "until the
   registrar's system acknowledges it", with the line below activating it unconditionally;
   `institution-nav.tsx` says the learning screen "reports import provenance".

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
- **`node dist/main.js` serves the build, not the source.** Probing behaviour after a code
  change without `pnpm build` first measures the previous build and reads as "my fix did
  nothing". Check `stat dist/...` against the source when a live check disagrees with a
  green test.

## Caveats worth knowing

- **The bundle guard went up, not down.** It was raised to 540 kB for Phases 1–2 and meant
  to come back down; the app measured 506 kB. By the time that was taken it measured
  **539.88 kB** — an interface pass across every screen had spent the whole margin. It is
  now **555 kB** against a measured 546.74 kB. `.size-limit.mjs` has the full reasoning.
  Every reduction lever that file has ever named is spent; the next person needing room
  will have to ship less.
- **Two notification services have no callers.** `LearningActivityNotificationsService` and
  `TimetableNotificationsService` exist and nothing invokes them, so nobody is told when an
  assignment is set or marked, or when a class moves or is cancelled. The calendar carries
  those; the notifications list does not.
- **Deleting a material or a submission leaves the object in the store.** Only erasure
  calls `StorageService.delete`.
- The person pickers are a typeahead now, but the endpoint behind them still returns the
  whole directory unpaginated. Fine at 170 people, not at 20,000.
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
- The k6 run leaves a `LOAD-RUSH-<n>` course behind by design. Re-seeding is the cleanup.
