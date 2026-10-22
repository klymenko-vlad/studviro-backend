# 0029 — Study progress needs a programme to measure against

Status: accepted
Date: 2026-09-19

Closes step U2 of `docs/Product Plan.md` on the backend.

## Context

The grades screen already totalled a student's credits, counted their passes and failures
and computed the weighted average on the 1–4 scale. Every one of those numbers is a
_numerator_. A student does not ask how many credits they have collected; they ask how much
is left, whether they are on track for the year, and whether they can graduate. None of
those can be answered by a total.

The denominator has to come from the programme. `programs.standardLengthSemesters` was
already in the canonical model and already populated — by the demo seed, and by any
institution using the Phase 1 screens — and nothing read it.

## Decision

**`GET /institutions/:id/me/study-progress` now carries a `programmes` array**: one entry
per _active_ programme membership, each with the credits required, earned, remaining and a
whole-number percentage.

**Credits required is derived, not stored: `standardLengthSemesters × 30`.** Thirty ECTS a
semester is the European norm and the only defensible default. It is a default rather than a
rule, and an institution that wants to state its own total should be able to — that is a
nullable `creditsRequired` column on `programs`, and it is deliberately not added here.
Adding a column to carry a number nobody has asked to override yet is speculative; the
constant lives in one place and turning it into a column later is a migration and one
`??`.

**Where there is no length recorded, there is no denominator and the API returns `null`.**
Not zero, not a guess. A screen showing "0% complete" because a programme's length was never
entered is worse than a screen that says it does not know, because the first looks like a
fact about the student.

**Only `active` memberships count.** A graduated or terminated membership is history.
Reporting "50% complete" against a programme somebody left two years ago is not progress.

**Nothing is capped into nonsense.** A student past the requirement reads 100% and zero
remaining, never 104% and minus twelve.

## Consequences

- The grades screen can show a position rather than a pile, and the dashboard can too.
- A student on two programmes gets two standings, because the credits that count towards
  one are not necessarily the credits that count towards the other. The API does not try to
  merge them.
- **The credits are not the whole degree.** `creditsComplete` says the credits are there and
  says nothing about a final examination, a thesis, or a compulsory course the student has
  skipped. A real "can I graduate" answer needs the programme's curriculum — which courses
  are compulsory for which year — and StudViro has no curriculum table. That is the next
  honest step and it is larger than this one.
- The 30-ECTS assumption is written at the constant and repeated here so that the first
  institution it does not fit knows exactly what to change.
