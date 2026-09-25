# Status

Handoff note for the next agent. Keep it under ~120 lines; trim rather than append.

Last updated: 2026-09-25

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

Found work since has been shipped or closed as it turned up — tracker B4 and B14–B25,
ADRs 0032–0034: exam attendance, the waiting list for a full course and the notice when
a place on it comes free, captcha, storage reclamation, the paginated directory, the k6
fixture, and the sign-in key fix. Read the tracker's table for any one of them.

## What to do next

**Next task: B31 — times in the institution's own time zone.** The client pins
`Europe/Kyiv` (`shared/config/i18n/request.ts`), so a Bratislava institution sees every
lecture, exam and deadline an hour late, and the exam-term and assignment forms store what is
typed as UTC. Read and enter every time in the institution's `timezone`; the calendar's day
grouping and the forms' day/time split both move with it.

After that, take the **open table in `Task Tracker.md`** ("Found walking the app,
2026-09-25") top down. It is ranked, and it is the output of an eight-agent walk of the app;
B32 and B33 (notifications that land nowhere useful) and B34 (no person page) are what makes
the product feel like separate screens rather than one tool. **B35 needs a product answer
first** — ask what a registrar should be able to do before building it.

Noticed while walking, not fixed:

- On this machine, the demo seed owns **Mock University of Košice**. "Demo University"
  was created by hand and has almost no data, so walk the seeded one. The walk left behind a
  course _AUDX-01_, a pending invitation to `audit.walkthrough.registrar@example.com` and a
  few marks on Algorithms; `pnpm db:seed` puts it back.
- `backend/.env` here had no `STORAGE_*` block, so every upload was signed for AWS and
  failed. The MinIO defaults from `.env.example` were added on 2026-09-25.
- `agent-browser click` by ref can land under the sticky header once a button is
  scrolled to the top. Focus the button and press Enter instead. This is a tool quirk,
  not an app bug.

## Standing decisions — do not re-ask these

- **Object storage**: Cloudflare R2 or AWS S3, both S3-compatible. MinIO runs in
  `docker compose` for development and CI. **No credentials are needed until deploy; do not
  create a bucket.** Four env vars switch targets — see `docs/Deployment.md`.
- **Local only.** Do not deploy, do not create hosted resources, do not spend money. Record
  what a release needs in `docs/Deployment.md` instead.
- **Institutional unknowns** (controller, DPO, retention, lawful basis) are `TODO(institution)`
  in a table at the top of each document. Do not invent them.
- **No quizzes** (ADR 0028).
- **Joining is by invitation only** (ADR 0035). No request-to-join, no domain self-join.

## Traps that have cost time here

- **A response that drifts from its own OpenAPI schema is refused by the client**, and reads
  as "could not be loaded" on a 200. The e2e harness now validates every 2xx body against
  `openapi.json` (`test/setup/openapi-contract.ts`), so the drift fails the server's suite.
  MSW fixtures in the client are hand-written and do not catch it.

- **A generic `CursorPageDto<T>` in an `@ApiOkResponse` breaks the generated client.**
  Its `items` carries no type, so the client validates it as an array of arrays and
  rejects every real response — "could not be loaded" on a 200, which reads as a
  server fault. Write a concrete page DTO: `AuditEventPageDto`,
  `PersonDirectoryPageDto`.
- **A server-only read imported through a slice barrel that also re-exports
  `'use client'` modules drags them into the client graph** — measured at 19 kB
  gzipped. It is why `captchaEnabled` lives in `shared/auth` rather than
  `entities/captcha`.
- **The first `useQuery` on a route that had none pulls React Query's observer
  machinery into its chunk** — 13.6 kB across the three auth routes. A value fixed
  at deploy belongs in a Server Component and a prop.
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
  now **555 kB** against a measured 550.78 kB. `.size-limit.mjs` has the full reasoning.
  Every reduction lever that file has ever named is spent; the next person needing room
  will have to ship less.
- A `waitlisted` enrolment holds no place and is not on the roster. A `requested` one
  holds a place while it is answered, but is not on the roster either.
- The seed's anchor is fixed at 2026-10-15 to stay deterministic; the seeded year is
  2026/2027. **Move the anchor once real time leaves it.** It deletes only the institution it
  owns, and never resets an existing user's password.
- `shared/ui`'s `Select` wraps the native control in a `w-fit` container, so `w-full` on the
  control does nothing. Every select in the app is natural width.
