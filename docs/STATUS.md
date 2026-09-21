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

The defect list this section used to carry has been worked through — 2026-09-19's eight
fixes are recorded in `Task Tracker.md`'s defect table and in **ADR 0031**, which
supersedes ADR 0028's guess at how a teacher derives a role.

On 2026-09-21 the notifications feature stopped being half-built.
`LearningActivityNotificationsService` and `TimetableNotificationsService` both existed,
were both tested, and neither was injected anywhere — so the calendar carried a moved
deadline and a cancelled class and the inbox did not. Both are now wired: assignment
create and update, timetable update, cancel and remove. A mark is new —
`submission_marked` names the one student whose work it is, because a classmate has no
stake in it. Two defects surfaced underneath:

- **`PATCH` on an assignment that changed only a date returned 500.** The paired
  `assessments` update was handed no columns and Drizzle refuses that. Each half of the
  pair is now left alone when nothing about it changed. This had always been broken;
  nothing tested a date-only edit.
- **An assignment drafted hidden and then published was never announced**, because the
  deadline had not moved. Becoming visible is now the publication — which is the ordinary
  authoring flow, so this was most of the feature.

Walked in a browser: marked a student's work as the administrator and moved Assignment 1's
deadline on _Information Security_, then signed in as `ada@studviro.local` and found both
in the inbox — the move reaching all eight enrolled students, the mark reaching one.

Also on 2026-09-21: **the four forms open to the internet carry a captcha.** Sign-up,
sign-in, the password-reset request and the demo request were metered by IP and nothing
else. **ALTCHA's protocol, implemented rather than imported** (**ADR 0033**): the client
hashes to find a number, so there is no third-party script, no site key, no account and
nothing to pay — and nothing about the visitor leaves the origin, which Turnstile and
hCaptcha cannot say. **Off by default**; `CAPTCHA_ENABLED` turns it on at deploy, and
production refuses to boot with the shipped secret when it is. Walked with it on: the
browser solved a 50,000-wide challenge and signed in in under two seconds, and the API
refused both an absent and a forged one.

Two bundle traps were found paying for it, both recorded in `.size-limit.mjs`: reading
the captcha state with `useQuery` cost **13.6 kB** because the three auth routes had no
client query at all, and importing the server-side read through `entities/captcha`'s
public API cost **19 kB** because that barrel re-exports two `'use client'` modules. The
read lives in `shared/auth` now and is passed as a prop. **Any server-only read added to
a slice whose barrel exports client code will do the same thing.**

Also on 2026-09-21: **the learning tab is an administrator's index, not a student's.** It
was gated on `offering:read`, which every student holds, so every student was offered a
screen naming every course in the institution with its workload and deadlines. The route
answers two questions — the page on _this_ offering, open to any reader of it, and the
whole index, which now additionally needs `offering:manage`. Its summary counted spaces
"matched to a course offering", which is every one of them; it now counts the offerings
that have **no** page yet, which is a question an administrator has.

Also on 2026-09-21: **a removed file no longer costs money for ever.** Only erasure called
`StorageService.delete`, so every material a teacher removed stayed in the bucket.
`StorageReclamationService` sweeps nightly at 04:00 and drops the objects of materials
tombstoned longer ago than `STORAGE_RECLAIM_AFTER_DAYS` (30), then clears the key it
reclaimed; a failed delete keeps its key and is retried. A sweep rather than a delete in
the request, for the reasons in **ADR 0032**. Asserted against MinIO itself, not a spy.
**Not covered, and now the known leak:** an upload ticket whose object was `PUT` but whose
row was never written belongs to nothing, and no bucket lifecycle rule can find it without
deleting live coursework — see `docs/Deployment.md`.

## What to do next

The backlog is complete and so is the defect list it ended with. What follows is found
work, in the order it is worth doing. Each is a real gap with evidence, not a wish.

**Next task — the Slovak translation.** Both catalogues are fully keyed; roughly 1,320 of
1,469 Slovak values are still the English string. The keys awaiting translation are
exactly those whose `sk` value equals its `en` value, so the pass is mechanical to scope
and can be taken in slices. Do not touch a value that already differs.

Then, in order:

1. **Paginate the person directory.** `GET /institutions/:id/people` returns everybody,
   unpaginated. The pickers in front of it are a typeahead now, so this is about the
   payload rather than the interface. The grant form on `/roles` still takes a raw user
   id and never got the picker.
2. **Stale comments that now mislead.** `my-enrollments.controller.ts:67` and
   `my-enrollments.service.ts:27` still say a place stays `requested` "until the
   registrar's system acknowledges it", with the line below activating it unconditionally. The
   `institution-nav.tsx` one is gone.

Noticed while walking these steps, not fixed:

- The assignment editor's date fields are a segmented spinbutton whose hidden
  `input[name=dueAt]` mirror is the **first** one in the DOM, shared with the add form
  above it — worth a look if a date edit ever writes to the wrong assignment.
- **A React duplicate-key error on signing in**, key `null`, logged the moment `/account`
  renders. It predates all of this work and is on no screen touched here.

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
  now **555 kB** against a measured 552.05 kB. `.size-limit.mjs` has the full reasoning.
  Every reduction lever that file has ever named is spent; the next person needing room
  will have to ship less.
- **An abandoned upload is never reclaimed.** A removed material's object is now swept, but
  an object `PUT` against a ticket whose row was never written belongs to nothing and no
  database-driven sweep can see it. ADR 0032 says why a lifecycle rule cannot do it either.
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
