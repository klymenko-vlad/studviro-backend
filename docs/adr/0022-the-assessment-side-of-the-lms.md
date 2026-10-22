# 0022 — The assessment side of the LMS: a gradebook, not a second grade

Status: accepted
Date: 2026-09-16

## Context

ADR 0020 landed `learning_spaces` and `learning_activities`; ADR 0021 put the deadlines they
carry in front of students. The four remaining learning tables — `assessments`,
`assessment_results`, `activity_completions`, `submission_refs` — had no importer, so `mock-lms`
advertised `courses.read` and `activities.read` only and the other domains reported `skipped`.

Two consequences followed. Nothing knew whether a student had handed work in, so a deadline card
said _past due_ to a student who submitted a week early. And a student could see the official
grade for a course without seeing any of the marks it was built from.

## Decision

### An LMS mark is a separate answer from a course result, not a stage of one

`assessment_results` does **not** feed the calculated stage of `course_results`. They answer
different questions: a course result is the registrar's record of how a course ended, with the
calculated / proposed / official ladder ADR 0011 built; an assessment result is one mark in one
learning system gradebook column. Merging them would silently claim the LMS is authoritative over
a grade the registrar owns, and would make a teacher's proposed grade indistinguishable from an
arithmetic mean of quiz scores.

They are therefore rendered side by side on the course page — _My result_ above, _Marks from the
learning system_ below — both behind `grade:read`, and a reader can see which is which. If the
calculated stage should one day be derived from the gradebook, that is a rule an institution
configures, not a default the importer assumes.

### A gradebook column is its own domain, ahead of the marks in it

The connector gained `getAssessments()`, returning the columns themselves, alongside `getGrades()`
returning one person's mark in one column. Both sit behind the single `grades.read` capability —
a connector that can read a gradebook can read both halves of it — which retires the invariant
that every learning importer names a distinct capability. The importer order is
`learningSpaces → learningActivities → assessments → assessmentResults → activityCompletions →
submissions`: each references only rows an earlier domain has written.

`LmsGrade` repeats `maxPoints` from its column so a mark normalizes to a share of the maximum
without a second read. The share is stored in `normalized_score`; the API exposes it as a
percentage, falling back to dividing points by the maximum when an older row has no share stored.

### The LMS names a person by the identifier the SIS issued

A learning run has no persons domain — a person becomes a user through the academic import.
`SyncSession.userFrom('sis', externalId)` resolves an account against the identity the SIS
provisioned, mirroring the existing `referenceIn` for canonical rows. `ExternalIdentitiesRepository`
gained `findBySubjectInSource` for it.

The consequence is deliberate and visible: an LMS run against an institution whose SIS half has
never run now finishes **partial**, not succeeded. Spaces and activities land; every mark, hand-in
and completion fails to resolve a person, the watermark stays where it was, and the next run after
an academic import picks them all up. Reporting that as success would hide the missing half.

### A deadline that was met is not past due

`GET .../me/deadlines` carries the caller's newest submission per activity — state, when it
arrived, whether it was late. The card reads _Handed in_ where a submission exists, _Missed_ where
one does not and the deadline has passed, and _Past due_ to a teacher, who hands nothing in. The
absence of a submission row is the LMS saying nothing arrived, not saying nothing is known.

### The mock LMS fixture sits in a term already under way

`MockLmsOptions.weeksElapsed` places deadlines from six weeks behind the anchor forward, so the
fixture has work already handed in behind it as well as work still to come. Hand-ins, marks and
completions are generated only for deadlines the anchor has passed, and against every person the
SIS enrolled — the LMS does not model the registrar's enrolment statuses, and filtering by them
would make the fixture's contents depend on where the term sits.

## Consequences

- The course page shows a student every mark recorded for them, with the hand-in and completion
  each was awarded on, and flags a column that does not count toward the final grade.
- `GET /institutions/:id/me/assessment-results[?offeringId]` is behind `grade:read` and scoped to
  the caller; there is no endpoint for reading somebody else's marks. Grade entry is G4/G8.
- Reconciliation still covers the SIS half only — it is constructed against the academic connector
  and `ACADEMIC_IMPORTERS`, so all six learning domains are absent from its report. Giving it a
  second source system remains its own step.
- The `attempt` column on `submission_refs` is imported but only ever `1` from `mock-lms`; the
  read side already takes the newest attempt, so a connector that reports resubmissions works
  without a schema change.
