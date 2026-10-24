# 0050 — Quizzes are activities drawn from a versioned question bank

Status: accepted
Date: 2026-10-24

Step CB6 of `docs/Course Builder Plan.md`. **Supersedes ADR 0028's L7**, which ruled quizzes
out. Builds on ADR 0028 (an assignment is a `learning_activity` with an `assessment`) and ADRs
0043–0048 (the outline and its rules).

## Context

ADR 0028 kept quizzes out because nothing asked for them, and because a quiz is a product, not
a feature: a bank with versions, several question types with their own editors and marking,
timing, shuffling, attempts that survive a closed laptop, partial credit, review rules. The
user asked for them on 2026-10-22. The size argument still stands, which is why the plan
splits quizzes into three steps: **CB6** authoring (this record), **CB7** taking a quiz,
**CB8** review and marking. This step builds no attempt, but the schema is drawn so the next
two add tables beside it rather than reshape it.

## Decision

### Quizzes are back in scope

`quiz` returns to `learning_activity_type` (migration `0040`). ADR 0028 removed it because
advertising it promised something that would not arrive; it now arrives.

### The bank belongs to the course page, one per offering

A **question bank** is per learning space, so per course offering (term), not per catalogue
course. Considered the other way because CB10 (reuse last year's course) would get the bank
for free if it were shared across terms. Rejected:

- Quizzes reference a question, and an attempt takes **the latest version** when it starts
  (below). A bank shared across terms means editing a question for next year silently
  changes it in a quiz still running this year.
- Who may edit a shared bank has no good answer: every past teacher of the course, or only
  the current ones, with last year's quizzes depending on it either way.
- Every other authored thing — sections, materials, assignments — belongs to the space, and
  `LearningAccessService` already says who authors a space.

So **CB10 copies the bank** with the rest of the outline (each question's latest version as
version 1 of a new question, quiz slots remapped to the copies). The copy is cheap; the
coupling would not have been.

### Categories are flat

A category has a name, unique in its bank (case-insensitive). One level, no nesting: a
random draw takes from one category, and nesting asks "including subcategories?" for every
draw, list and count. A course's bank is small enough for names like "Sorting — hard". A
category can be renamed; it is removed only when empty (`409 QUESTION_CATEGORY_NOT_EMPTY`)
and no live quiz draws from it (`409 QUESTION_CATEGORY_IN_USE`). Every question is in exactly
one category. Categories are listed a page at a time and filtered by name.

### Questions are versioned on edit

- `questions` is the identity: bank, category, **type** (fixed for life — changing a
  single-choice question into an essay is a new question), `latest_version`.
- `question_versions` holds what was asked: name, text, default mark, general feedback and the
  **answer key** (`jsonb`), numbered from 1, never updated.
- Editing (`PUT …/questions/:id`) writes version n+1 when anything that a student would see
  or be marked by changed, and nothing when the content is identical. Moving to another
  category alone is not a version.
- A question is listed by its latest version, a page at a time, filtered by category, type
  and text (name or question text). The list carries no answer keys; reading one question
  does. `GET …/questions/:id/versions` pages every version, newest first.
- A question held by a live quiz cannot be removed (`409 QUESTION_IN_USE`); removing is a
  soft delete, so versions stay for the attempts that asked them.

**The rule for attempts (CB7):** a quiz slot names a _question_, not a version. When an
attempt starts, each slot is resolved to the question's latest version at that moment and the
attempt records that version's id. An attempt then keeps the text, choices and key it was
asked, whatever is edited later. Regrading on a changed key (CB8) is an explicit act.

### Seven types, one answer key each, validated on the server

| Type              | Answer key                                   | Rules                                          |
| ----------------- | -------------------------------------------- | ---------------------------------------------- |
| `single_choice`   | choices: text, correct, feedback             | 2–20 distinct choices, exactly one correct     |
| `multiple_choice` | choices: text, correct, feedback             | 2–20 distinct choices, at least one correct    |
| `true_false`      | correct, feedback for "true" and for "false" | the answer is required                         |
| `short_answer`    | accepted answers, case sensitive             | 1–20, none empty, distinct under the case rule |
| `numerical`       | value, tolerance                             | finite value, tolerance ≥ 0 (default 0)        |
| `matching`        | pairs: prompt, answer                        | 2–20 complete pairs, distinct prompts          |
| `essay`           | none                                         | marked by hand in CB8                          |

Every question has a name, text, a default mark (> 0) and optional general feedback. A field
belonging to another type is refused (`400 QUESTION_FIELD_NOT_APPLICABLE`) rather than
silently stored. The key is `jsonb` rather than an answers table: it is read and written
whole, per version, and never queried by its parts; one pure function (`answerKeyOf`) is the
only way in. Each short answer earns full marks (Moodle's per-answer grade fractions are not
modelled); a numerical question has one answer with a tolerance.

### Answer keys are for authors only

Every bank and slot route answers `403` to anyone who does not author the course. No
student-facing response — the quiz list, the quiz by id, the outline, the student view,
deadlines — carries a question, a choice or a key; the e2e suite asserts it.

### A quiz is an activity placed like an assignment

A quiz is a `learning_activities` row of type `quiz`, so everything from CB1–CB11 holds for
it unchanged: section and position (shared ordering), hide/show, available from/until,
restrictions, groups, completion, progress, the sight report, the student view.

- **Settings** in `quizzes` (one row per quiz activity): time limit (stored in seconds,
  1 minute–24 hours in the API, or none), grading method (`highest`, `last`, `average`),
  shuffle questions (off by default) and shuffle choices (on). The attempt limit is the
  activity's `max_attempts` (1–100, or null for unlimited; default 1).
- **Window**: `opens_at` is when attempts may start; the quiz's **close is stored in
  `due_at`** — it is the quiz's deadline, so `/me/deadlines`, the calendar, the iCalendar
  feed and _deadline published / moved_ read it unchanged. `closes_at` is unused for a quiz.
  Open must be before close (`400 QUIZ_WINDOW_INVALID`).
- The response carries `settings` with `attempts`: `upcoming`, `open` or `closed`, decided on
  the server's clock (principle 2). A student who may see only the title (scheduled or
  locked) gets `settings: null` and no brief, as for an assignment.
- **Its own gradebook column**: an `assessment` is created with it, as for an assignment,
  worth **10 points** unless set. Like Moodle's _maximum grade_, the column's points are
  separate from the sum of the question marks; an attempt's raw score will be scaled to it
  (CB7). This keeps pass marks and restriction thresholds stable while questions are added.
- **Completion**: `none`, `manual`, `submitted` (an attempt finished — the fact arrives in
  CB7), `marked`, `passed` with ≥ N points. **Restrictions** can wait for a quiz to be
  complete or for a mark in it: a _mark_ condition now has an optional `itemKind`
  (`quiz`; absent means `assignment`, so stored restrictions read as before).
- The item kind `quiz` joins `material` and `assignment` in completion, restriction, sight
  and group-content keys (`quiz:<id>`).

### Questions in a quiz are slots

`quiz_slots`, ordered by `position`, at most 100 per quiz, each either:

- **a question by hand** (`kind = question`, a `question_id`, its mark — the question's
  default mark unless given); a question appears by hand at most once per quiz
  (`409 QUIZ_QUESTION_ALREADY_ADDED`); or
- **a random draw** (`kind = random`, a `category_id`, `pick_count` 1–50, the mark of each
  question drawn — 1 unless given). The category must hold at least that many questions when
  saved (`400 QUIZ_RANDOM_NOT_ENOUGH_QUESTIONS`).

A quiz may mix both. A check constraint keeps each row to one shape. Slots are paged and
filtered (by question name and text, or the category drawn from), with the quiz's question
count and total of marks across all pages. Moving a slot renumbers the rest.

## CB7 and CB8, sketched — not built

```text
quiz_attempts
  id, institution_id, learning_activity_id → quizzes, user_id, attempt (1…),
  state (in_progress | finished | abandoned), started_at,
  deadline_at (min(started_at + time limit, quiz close) — the server's clock decides),
  finished_at, raw_marks, points (scaled to the assessment's max), unique (quiz, user, attempt)

quiz_attempt_questions
  id, attempt_id, position, slot_id (null once the slot is gone),
  question_version_id → question_versions  (the version asked, fixed at start)
  mark (the slot's mark at start), choice_order jsonb (the shuffle, fixed at start),
  response jsonb (saved as given), auto_mark, manual_mark, marked_by_id, marked_at,
  feedback

quizzes (CB8 adds) review options: what a student sees (answers, right/wrong,
  correct answer, feedback) and when (immediately, after close, never)
```

A random slot is resolved at the start of an attempt to `pick_count` distinct questions from
its category, excluding questions the quiz already asks by hand. The quiz's
`assessment_results` row is written from the attempts by the grading method, as marking does
for an assignment; completion's `submitted` fact is the first finished attempt.

## Consequences

- A question cannot be removed while a quiz holds it, and a category while a quiz draws from
  it. A removed quiz no longer holds anything.
- A draw may later find fewer questions than it picks, if questions are removed or moved
  out. CB7 must say what an attempt does then; authoring checks only when the draw is saved.
- _Deadline published_ and _deadline moved_ fire for quizzes; the inbox still calls them an
  "assignment deadline" (Noticed).
- Search still indexes no learning content (ADR 0044).
