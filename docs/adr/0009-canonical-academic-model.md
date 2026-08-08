# 0009 — Canonical academic model

Status: accepted
Date: 2026-08-08

## Context

The platform unifies a Student Information System (AIS2) and an LMS (Moodle). Both hold
overlapping academic data, and both use the word "course" for different things: AIS2 has a
catalogue course and an annual registration, Moodle has a course shell full of activities.
Neither physical schema may become the platform's model — that would make the second
connector a rewrite rather than an addition.

Nothing downstream can be built before these tables exist: identity linking, scoped
authorization, institution configuration, the mock SIS and both connectors all read from or
write into them.

## Decision

A canonical schema in `src/database/schema`, split by bounded context, with two rules.

### External identifiers are never primary keys

Every canonical row has a platform UUID and carries provenance: `source_system`,
`external_id`, `source_version`, `source_updated_at`, `last_synchronized_at` and
`synchronization_status`. A partial unique index over
`(institution_id, source_system, external_id)` — restricted to live rows with a non-null
external id — makes one source record map to at most one canonical row, while leaving
platform-owned rows unconstrained.

Matching on names or email addresses is therefore never necessary, and a renamed course or a
student who changes their address does not create a duplicate.

`synchronization_status` (`in_sync`, `pending`, `conflict`, `failed`) is where reconciliation
records disagreement, so that a conflict is a queryable state rather than an overwritten row.

### Every canonical row carries `institution_id`

Deployment is single-institution, but a model that only becomes multi-tenant through a
migration of every academic table cannot be reused by a second university. `users` is
deliberately untouched: a user belongs to an institution through `external_identities`, which
avoids a nullable tenant key on the one table that predates the model.

### Structure

| Context               | Tables                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `institutions`        | `institutions`, `org_units`                                                                                              |
| `external-identities` | `external_identities`                                                                                                    |
| `role-assignments`    | `role_assignments`                                                                                                       |
| `academic-structure`  | `academic_terms`, `programs`, `courses`, `course_offerings`, `teaching_assignments`                                      |
| `enrollments`         | `program_memberships`, `enrollments`, `study_groups`, `study_group_memberships`                                          |
| `scheduling`          | `rooms`, `timetable_events`, `exam_terms`, `exam_registrations`                                                          |
| `learning`            | `learning_spaces`, `learning_activities`, `assessments`, `assessment_results`, `activity_completions`, `submission_refs` |
| `course-results`      | `official_course_results`                                                                                                |

`Course`, `CourseOffering` and `LearningSpace` are three tables, not one. The catalogue entry,
its instance in a term, and the LMS shell that supports it have different owners and different
lifetimes; collapsing them is the naming conflict that makes SIS/LMS integrations fail.

Roles are `role + scope`, matching Moodle's contextual capabilities and AIS2's faculty-filtered
functions without reproducing either. `scope_id` is polymorphic and carries no foreign key; a
check constraint enforces that exactly the `institution` scope has no scope id. `users.role`
stays as it is and governs access to the platform itself, which is a different question.

### Grades

`official_course_results` holds `calculated_*` (from LMS evidence), `proposed_*` (a teacher's
submission) and `official_*` (what the registrar recorded) as separate columns with a status
lifecycle. A final-grade mismatch is the highest-risk conflict in the system, and last-write-
wins is not an acceptable resolution for it.

## Ownership

Following the source-of-truth matrix in `docs/System Plan.md`:

| Data                         | Owner             | Direction                          |
| ---------------------------- | ----------------- | ---------------------------------- |
| Org units, programs, courses | SIS               | SIS → platform → LMS metadata      |
| Course offerings             | SIS               | SIS → platform → LMS shell         |
| Academic enrolment           | SIS               | SIS → platform → LMS participation |
| Teaching assignments         | SIS/HR            | source → platform → LMS            |
| Timetable, exam terms        | SIS/timetabling   | SIS → platform                     |
| Learning spaces, activities  | LMS               | LMS → platform projection          |
| Assessments and results      | LMS               | LMS → platform                     |
| Submissions                  | LMS               | LMS → platform reference only      |
| Proposed final grade         | Platform workflow | computed/entered → approval        |
| Official final grade         | SIS               | workflow → SIS → read model        |
| Role assignments             | Platform          | platform-owned                     |

Submissions are references (`submission_refs`) rather than content: the LMS keeps the files.

## Consequences

- Connectors write provenance on every upsert; a write without it is a bug, not a shortcut.
- Repositories must scope reads by `institution_id`. Nothing in the schema enforces this today —
  row-level security or a repository-level scope is a follow-up.
- Soft delete is uniform, so every uniqueness constraint is partial on `deleted_at is null`.
- Theses, transcripts, notifications and audit are deliberately out of scope for this migration;
  they depend on nothing here and can be added without reshaping it.
