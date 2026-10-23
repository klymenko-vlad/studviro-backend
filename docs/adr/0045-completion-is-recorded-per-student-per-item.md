# 0045 — Completion is recorded per student, per item, by the server

Status: accepted
Date: 2026-10-23

Step CB3 of `docs/Course Builder Plan.md`. Builds on ADR 0043 (sections), ADR 0044
(availability) and ADR 0028 (an assignment is a `learning_activity` with an `assessment`).

## Context

`activity_completions` has existed since the canonical schema and was never written. Moodle
lets an author say, per activity, when a student has completed it, and shows the student a
tick and a progress bar and the teacher a completion report. CB4 (restrict access: "unlock
after X is complete") needs that answer from one place.

Materials and assignments are two tables. `activity_completions` pointed at
`learning_activities` only, so a material had nowhere to record a completion.

## Decision

- **One table, a nullable reference per kind.** `activity_completions.learning_activity_id`
  becomes nullable and gains a sibling `learning_material_id`; a check constraint
  (`num_nonnulls(…) = 1`) makes every row point at exactly one item, and each kind has its
  own partial unique index with the user. A second table was rejected: progress, the
  teacher's table, CB4's checks and the personal-data export would all read two tables and
  union them, for rows that are the same shape. Migration `0037`.
- **A rule per item, chosen by the author** (`completion_rule`): `none` (the default — nothing
  is tracked), `manual` (the student ticks it), `viewed` (materials only: opened or
  downloaded), `submitted`, `marked`, `passed` (assignments only). `passed` needs a pass mark,
  `completion_pass_points`, in points like Moodle's _grade to pass_, no higher than the
  assignment's points; it is dropped when the rule changes away from `passed`. A rule that
  does not fit the item is `400`. Assignments do not offer `viewed`: opening the brief is not
  the work.
- **The row holds the facts the server cannot re-derive, and the state derived from them.**
  `viewed_at` (first opening) and `marked_done_at` (the student's tick) are kept whatever the
  rule; submissions and marks are already their own tables. `state` and `completed_at` are
  computed by one pure function (`completion-rule.ts`) from the rule and the facts, so
  changing a rule never loses what a student did: a material opened before it was tracked
  counts once the rule becomes `viewed`, and a tick survives a round trip through another rule.
  `completed_at` is the time of the event that met the rule.
- **States**: `complete`, `complete_pass` and `complete_fail` (a mark below the pass mark), or
  `incomplete`. A fail is not done: it does not count towards progress or unlock anything.
- **Computed on the server when something happens**, in the transaction that changes it:
  a hand-in, a mark (and a corrected mark), a view, a tick, and — for every student — a change
  of the rule, the pass mark or the assignment's points. `CompletionService.recompute` is the
  one way in.
- **A view is recorded on the server's read path.** Downloading a file records it. A link or a
  note has no server read of its own, so the client calls `POST …/materials/:id/views` when
  the student follows the link, and when a note's text is shown in the outline (its text _is_
  the material). Only an enrolled student's view is recorded; a teacher's is not.
- **Visibility first.** A tick or a view on an item the student cannot open — hidden, in a
  hidden or unopened section, scheduled, ended — answers `404`, exactly as the by-id reads in
  ADR 0044. Ticking is for an enrolled student only (`403 COMPLETION_STUDENTS_ONLY`) and only
  on a `manual` item (`409 COMPLETION_NOT_MANUAL`).
- **Progress counts only items with a rule that the student can open now** (`sightOf` is
  `full`), for the page and per section: `GET …/learning-spaces/:id/my-progress`. A
  title-only item that has not opened yet is not counted; when it opens, the total grows and
  the bar moves back, as Moodle's does.
- **The teacher's table** (`GET …/learning-spaces/:id/completions`) is for the course's
  authors (teaching it or `offering:manage`, behind `enrollment:read` like the roster): every
  tracked item as a column, hidden ones included, against a page of enrolled students,
  filterable by name or email.
- **One place for CB4**: `CompletionService.isComplete(userId, item)` and
  `completedItems(userId, spaceId)` (a set of `material:<id>` / `assignment:<id>` keys),
  exported from `LearningModule`.

## Consequences

- The personal-data export lists material completions too, with `viewed_at` and
  `marked_done_at`; `learningActivityId` is now nullable there.
- Removing an item soft-deletes it; its completions stay, and drop out of every read because
  they join to a live item.
- An assignment whose rule is `submitted` is complete once anything is handed in, late or not.
