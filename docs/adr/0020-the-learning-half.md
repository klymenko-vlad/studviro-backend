# 0020 — The learning half: `mock-lms`, a second source system, no new permission

Status: accepted
Date: 2026-09-14

## Context

Step 14 froze `LearningSystemConnector` and ADR 0009 gave the LMS six canonical tables
(`learning_spaces`, `learning_activities`, `assessments`, `assessment_results`,
`activity_completions`, `submission_refs`). Nothing filled them. Steps 31–33 are all gated on a
Moodle instance nobody has, and no numbered step plays the part `mock-sis` played for the SIS
half — the gap the tracker records as **G2**.

The product's headline claim is one calendar and one grade view across _both_ systems. With the
LMS half dead, that claim was untestable: every screen in the platform was reading SIS rows only.

## Decision

### `mock-lms` derives its fixtures from `mock-sis`, rather than inventing a parallel university

`MockLmsConnector` injects `MockSisConnector` and builds one learning space per course offering
the SIS reports, naming that offering by its SIS external identifier. Activities hang off the
space on a deterministic rotation, with the assessable types (`assignment`, `quiz`, `workshop`)
carrying an `opens_at`/`due_at` pair and the rest carrying none.

The alternative — a second independent generator with its own seed — was rejected because the
interesting behaviour in a unified platform is precisely the _join_: does the LMS course the
student sees line up with the SIS offering they are enrolled in. Two independent generators
would have to be reconciled by hand-maintained fixture tables to say anything about that, and
the tables would drift. Deriving one from the other makes the alignment true by construction, and
it mirrors the real convention: a Moodle course's `idnumber` is set to the SIS key.

### The cross-source reference is explicit, not a naming coincidence

A learning space is imported under `source_system = 'lms'`, but it points at a course offering
imported under `source_system = 'sis'`. `SyncSession.reference` scopes lookups to the running
target's source system, so it cannot resolve that.

Rather than widen every lookup, the session gained one narrow verb — `referenceIn(sourceSystem,
table, externalId)` — and the connector contract gained one field, `LmsCourse.courseOfferingExternalId`,
mirroring the `courseOfferingExternalId` that `LmsCourseProvisionCommand` already carried in the
same file. The link is therefore a declared fact the connector asserts, not something inferred by
matching a code string.

A space whose offering has not been imported yet lands **unlinked** rather than failing. The two
halves are independently scheduled; making the LMS run depend on a prior SIS run would couple
them for no gain, and an unlinked space is a visible, recoverable state that the next run repairs.

### An LMS run is the same run, on a second source system

`sync_runs` already carried `source_system`, and `SOURCE_SYSTEMS` already had `lms`. So
`POST /synchronization/runs` gained an optional `sourceSystem` (`sis` by default) rather than a
second endpoint. The two halves take separate distributed locks and separate in-flight checks, so
a SIS run and an LMS run may proceed at once; watermarks were already keyed by source system.

`DomainSynchronizer` became generic over the connector type, and the importer contract split into
`SourceImporter<TConnector, TCapability>` with `AcademicImporter` and `LearningImporter` as its
two instantiations. No behaviour changed on the academic side.

### Reading learning spaces is gated on `offering:read`, not a new permission

A learning space is the LMS face of a course offering, and anyone entitled to see the offering is
entitled to see its learning space. Adding a 23rd permission would mean touching the catalogue,
the role map, the grant screen and its tests — a separate step's worth of work to express a
distinction the model does not actually make.

## Consequences

- Reconciliation does **not** pick the learning domains up. `ReconciliationService` is
  constructed against the academic connector and `ACADEMIC_IMPORTERS`; extending it to a second
  source system is its own step. The new domains are simply absent from `RECONCILED_TABLES`,
  which is a `Partial` map, so nothing breaks — they are just not compared.
- Four of the six learning tables remain empty. `mock-lms` advertises `courses.read` and
  `activities.read` and nothing else, so grades, submissions, completion and enrolment report as
  `skipped` rather than as silently succeeding on no data.
- `learning_activities.due_at` is now populated, which is the precondition **G3** was waiting on:
  the calendar, the dashboard and the notification layer can grow a deadline layer over real rows.
