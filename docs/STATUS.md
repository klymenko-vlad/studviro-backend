# Status

Handoff note for the next agent. Keep it under ~100 lines; trim rather than append.

Last updated: 2026-09-18 (**the product pivoted — read ADR 0024 before anything else**)

## What this is

**A standalone academic platform that does the job AIS2 and Moodle do between them.** The
institution enters its own data and StudViro is where that data lives. There is no upstream.

This changed on 2026-09-18. It was scoped as a unified surface _over_ those two systems, and
the integration was never connected to anything — no HTTP client exists anywhere in
`modules/connectors`, both registered connectors generate data in-process from a seed, and
`healthCheck()` returns `reachable: true` without checking. ADR 0024 records the decision and
what it costs. `docs/Product Plan.md` is the backlog now; `Tasks Plan.md` is superseded
research output kept for the record.

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
- **Public surface, API, CI, deployment** — home and audience landings, `/contact` over a
  metered `POST /api/v1/demo-requests`; generated drift-checked `openapi.json`; lint,
  typecheck, coverage, build and security gates in both repositories; migration-aware deploy.

## Next task — R6: a demo seed, because there is nothing to look at

**Phase 0 of `Product Plan.md` is done except R6, and R6 blocks everything else being
demonstrable.** `pnpm db:seed` currently creates two users and no institution, so a fresh
checkout has no programmes, no courses, no term, no students — nothing to open a screen on.

The `mock-sis` dataset generator was the only realistic synthetic university this project had
(~5,000 linked records: faculties, departments, programmes, courses, offerings, teachers,
students, enrolments, timetables, exam terms, results). It was deleted with
`modules/connectors`. **Recover it from git at `9d28d63~1`**, under
`src/modules/connectors/mock-sis/`, and rewrite it as a seeding script:

- It currently emits `ConnectorRecord<T>` objects for an importer to apply. It should write
  canonical rows directly through the repositories, in dependency order.
- Drop `externalId`, `sourceVersion` and `sourceUpdatedAt` — those columns are gone.
- Keep the deterministic seed, so two runs produce the same university.
- Wire it behind `pnpm db:seed` for a named demo institution, and make it idempotent or
  clearly destructive — say which.

**Then Phase 1 of `Product Plan.md`: the registry an institution can actually run.** This is
the real remaining scope and it is larger than it sounds. None of these can be created today,
because every one of them arrived by import:

| Missing               | Consequence                                                           |
| --------------------- | --------------------------------------------------------------------- |
| Academic terms        | Nothing to enrol into; the enrolment window lives here                |
| Org units and rooms   | No faculties, no place to hold a class                                |
| Course offerings      | `PATCH` exists; there is no `POST`                                    |
| Teaching assignments  | Nobody can be made a course's teacher                                 |
| Programme memberships | **Nobody can be made a student — this blocks self-service enrolment** |
| Study groups          | No seminar or lab groups                                              |
| Timetable events      | `schedule:manage` still gates nothing                                 |
| Exam terms            | Students can register for exams nobody can create                     |

Take them roughly in that order: it is dependency order, and programme memberships are the
one that unblocks a feature that already exists.

**After Phase 1, Phase 2 is the Moodle half** — file storage first, then learning spaces,
materials, assignments, submissions and marking. It is the larger of the two halves and it
needs object storage the platform does not have.

## Caveats

- **Steps 1–22 of the old plan were inferred from documents, not re-verified.**
- The client bundle is at 458.02 kB gzipped against a 480 kB guard. The guard was raised
  deliberately on 2026-09-18; the reasoning is in `.size-limit.mjs`. R2 will give a lot back.
- `/enroll` and `/exams` render the same card-and-reason shape twice, and
  `EnrollableOfferingCard` repeats `ExamTermCard`'s window and seats logic. One shared
  component would cover both.
- `admin@studviro.local`'s password on this machine's dev database is `newpassword123`, not
  the seed default; `pnpm db:seed` does not reset an existing user's password.
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
