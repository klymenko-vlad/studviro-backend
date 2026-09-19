# 0025 — The demo seed owns one institution and replaces it

Status: accepted
Date: 2026-09-19

Follows ADR 0024. Closes step R6 of `docs/Product Plan.md`.

## Context

Removing the integration removed the only thing that ever put academic data into the
database. `pnpm db:seed` created two users and no institution, so a fresh checkout had no
programmes, no courses, no term and no students — every screen rendered its empty state and
nothing in the product could be demonstrated, reviewed or walked in a browser.

The one realistic synthetic university this project ever had was the `mock-sis` dataset
generator, deleted along with `modules/connectors`. It generated a coherent ~5,000-record
university from a numeric seed: faculties, departments, programmes, courses, offerings,
teachers, students, enrolments, study groups, timetables, exam terms and past results, all
linked. What made it useless as an integration made it ideal as a fixture — it was never
talking to anything, it was inventing a university.

## Decision

**Recover the generator as the demo seed, and keep it a generator of _rows_.** It lives in
`src/database/demo-seed/` in three layers:

- `build-plan.ts` builds the university as plain values, with an in-memory `key` per object.
- `derive.ts` derives offerings, enrolments, groups, timetable, exams and results from it.
- `write-plan.ts` writes canonical rows in dependency order, resolving `key` to the uuid the
  row was written under.

`externalId`, `sourceVersion` and `sourceUpdatedAt` are gone with the columns that held
them. `key` replaces the first and is never persisted.

**The seed writes directly with Drizzle rather than through the repositories.** The
repositories are Nest providers mediated by `TransactionHost` and scoped to an institution
that does not exist yet; booting the container to create its first institution buys nothing
a script needs. What the repositories enforce — `institution_id` on every row, soft
deletion — the seed satisfies by construction, and the e2e test asserts it.

**It is destructive, for exactly one institution.** The institution with the demo code is
hard-deleted first and the cascade takes every institution-scoped row with it, so two runs
leave one university rather than two. Accounts on the generated email domain go with it.
Nothing else is touched: the named sign-in accounts are updated in place and never deleted,
and an account that already existed keeps the password it had — a seed that silently resets
a password somebody chose is a support ticket, not a convenience.

**The named accounts stand in for generated people** rather than existing beside them. The
demo teacher _is_ the first department's first teacher and the demo student _is_ the first
programme's first student, so each one opens onto a real dashboard instead of an empty one.
Neither is granted a role: `teacher` derives from the teaching assignment and `student` from
the programme membership (ADRs 0015–0018), and the seed proving that derivation works is
worth more than a shortcut.

## Consequences

- `pnpm db:seed` writes ~5,900 rows across fifteen tables in about a second, and every
  student, teacher, registrar and administrator screen has something on it.
- The dataset is deterministic: the same options give the same university, so a screenshot,
  a bug report and a test all refer to the same Adela Kováčová.
- The anchor is a fixed date rather than _now_, which is what keeps it deterministic. It
  will drift: the seeded academic year is 2026/2027, and once real time leaves it the demo
  will need its anchor moved. Making the anchor dynamic is a one-line change when that day
  comes and costs the determinism, which is why it was not made now.
- The seed is not a substitute for the creation surfaces in Phase 1. It proves the model
  holds data; an institution still cannot create a term, a room or an offering by hand.
