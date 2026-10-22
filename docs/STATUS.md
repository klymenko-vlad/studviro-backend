# Status

Handoff note for the next agent. Keep it under ~120 lines; trim rather than append.

Last updated: 2026-10-22

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
cd frontend && pnpm dev            # port 3001; the API is on 3000 here (frontend/.env.local)
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

**Account security (B53, ADR 0037)** shipped on 2026-10-04 at the user's request, ahead of
B31: `/account/settings` edits the profile, changes the password, turns on two-step
verification (TOTP plus recovery codes, a second step at sign-in) and lists and ends
sessions. A session is now a sign-in, carried in the access token as `sid`. Not built: an
institution requiring two-step verification, passkeys, changing the email address and
security mail, and deleting your own account.

**Course discussion (B58, ADR 0040)** shipped on 2026-10-18: a _Discussion_ tab on each
course page, moderated by its teachers. Since 2026-10-19 an author edits their own posts
(B60) and a post carries up to three files (B61).

**Mail (B37, ADR 0039)** shipped on 2026-10-18: reset, invitation and welcome mail over
SMTP. Development catches it in Mailpit (`pnpm docker:up`, inbox on :8025).

**Notification mail (B59, ADR 0041)** shipped on 2026-10-19: e-mail copies of the
notification types a person turns on in `/account/settings`, sent only for what is still
unread after five minutes.

**Calendar subscriptions (B56, ADR 0038)** shipped on 2026-10-18: a secret iCalendar URL
and a `studviro.ics` download on the calendar page.

**Malware scanning (B62, ADR 0042)** shipped on 2026-10-19: with `MALWARE_SCAN=clamav`
every upload is scanned by ClamAV in the background, usable but marked as not yet checked until then; off by default.

**Uploads from the browser (B54)** were blocked by the client's CSP until 2026-10-18. The
client now needs `STORAGE_PUBLIC_URL` set to the store's origin (`docs/Deployment.md`).

## What to do next

**Next task: U1 of `docs/UI Work Plan.md` — `ConfirmAction` and every destructive action
behind it** (tracker B41). B33 shipped on 2026-10-22 as the plan's U0: notifications and
calendar, exam and result cards now open the course on the right tab, at the item.

Then take the plan's steps in order. It turns the 2026-10-22 audit pass (`UI Design
Audit.md`, C1–C11) into 25 one-session steps and absorbs the tracker's UX rows B34, B38,
B40, B41 and B45. The tracker rows it does not absorb — correctness and access defects such
as B43, B48 and B49 — stay in the **open table in `Task Tracker.md`** ("Found walking the
app, 2026-09-25"); take B43 (a teacher reading another course through the API) before Phase
2 of the plan. **B35 needs a product answer first** — ask what a registrar should be able
to do before building it. **The bundle is at 594.51 of 595 kB** — U1 must make room.

Noticed while walking, not fixed:

- **The API never sees a client's address.** The BFF calls it from its own host, so every
  session records the BFF's IP and the credential throttle counts all sign-ins through one
  BFF instance together. Forwarding `X-Forwarded-For` as-is would let a caller pick their
  throttle key; it needs the API to trust the BFF as a proxy hop (ADR 0037).
- **This machine's disk is full** (5.8 GB free of 687 GB). MinIO answers every upload
  `507`, so the storage, submissions, materials and personal-data e2e suites fail locally.
  They pass against a MinIO with room (`STORAGE_ENDPOINT=…`).
- **StudViro's Postgres container cannot start here**: another project's `db` holds port 5432. The 2026-10-04 walk ran against a throwaway Postgres on 5440 and Redis on 6390.
- The account menu has _Account_ and _Account settings_ as two entries. A single account
  page with tabs may read better once there is more to put there.

- The demo student `ada@studviro.local` is a second-year student since 2026-10-18: a
  student's past-year enrolments now follow the study year they were in then, so nobody
  repeats a course and first-years have no history.
- On this machine, the demo seed owns **Mock University of Košice**. "Demo University"
  was created by hand and has almost no data, so walk the seeded one. The walk left behind a
  course _AUDX-01_, a pending invitation to `audit.walkthrough.registrar@example.com` and a
  few marks on Algorithms; `pnpm db:seed` puts it back.
- `backend/.env` here had no `STORAGE_*` block, so every upload was signed for AWS and
  failed. The MinIO defaults from `.env.example` were added on 2026-09-25.
- The global `agent-browser` link points into a deleted worktree. Call
  `~/.nvm/versions/node/v22.22.2/lib/node_modules/agent-browser/bin/agent-browser-linux-x64`.
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
  MSW fixtures in the client are hand-written and do not catch it. A nullable enum must
  list `null` in its values (`enum: [...VALUES, null]`) or the client refuses null;
  `src/openapi-document.spec.ts` enforces it.

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
  now **595 kB** against a measured 585.08 kB: account security spent 15.71 kB, the calendar
  subscription card 2.19 kB, the institution clock 0.83 kB and the course discussion 5.8 kB,
  which is what raised it from 580 kB. `.size-limit.mjs` has the full reasoning.
  Every reduction lever that file has ever named is spent; the next person needing room
  will have to ship less.
- A `waitlisted` enrolment holds no place and is not on the roster. A `requested` one
  holds a place while it is answered, but is not on the roster either.
- The seed's anchor is fixed at 2026-10-15 to stay deterministic; the seeded year is
  2026/2027. **Move the anchor once real time leaves it.** It deletes only the institution it
  owns, and never resets an existing user's password.
- `shared/ui`'s `Select` wraps the native control in a `w-fit` container, so `w-full` on the
  control does nothing. Every select in the app is natural width.
