# 0052 — Quiz review is decided per option on the server's clock; marks stand over keys

Status: accepted
Date: 2026-10-24

Step CB8 of `docs/Course Builder Plan.md`. Builds on ADR 0050 (versioned questions) and ADR
0051 (attempts fixed at start, marked on close). Settles the three Noticed items addressed to
CB8: the gradebook revealing a hidden mark, a changed grading method or maximum leaving old
grades, and regrading on a changed key.

## Context

CB7 told a student nothing about a closed attempt. A teacher needs to choose what a student
learns and when — commonly the mark at once and the answers only once nobody can still use
them — and needs to mark essays, correct an automatic mark, and fix a wrong key after the
fact without losing what they decided by hand.

## Decision

### Five review options, each with one timing

`quizzes` gains five columns of `quiz_review_timing` (`immediately`, `after_close`, `never`),
migration `0042`:

| Option          | What it releases                                                                  | Default     |
| --------------- | --------------------------------------------------------------------------------- | ----------- |
| `responses`     | the student's own answers                                                         | immediately |
| `correctness`   | right / partly / wrong / not answered / waiting, and marks per question           | immediately |
| `correctAnswer` | the answer key, expressed in the ids and texts the attempt showed                 | after close |
| `feedback`      | general feedback, the feedback written for what they picked, the marker's comment | immediately |
| `overallMark`   | the attempt's mark and the quiz grade (see below)                                 | immediately |

Moodle offers four moments (during, immediately after, later while open, after close) per
option; the "two minutes after" distinction and "later while open" are folded into
_immediately_, since nothing here depends on that window. The defaults are Moodle's except
the right answer, which waits for the close: with several attempts allowed, a key shown at
once is a key shared before the next student starts.

- _After close_ means the server's clock is at or past the quiz's close (`due_at`), to the
  millisecond (tested both sides). A quiz with no close never reaches it; the form says so.
- `GET …/attempts/:id/review` is the student's own closed attempt, `409
QUIZ_ATTEMPT_IN_PROGRESS` while it runs, `404` for anyone else's, `403` for authors. The
  server builds the response from the options and its clock (`reviewShownAt`, `reviewOf`):
  a part not released is **absent** (null), never sent and hidden by the client. With no
  per-question option released, the questions list is empty; `revealsAt` names the close when
  something still waits for it. The question text and the choices shown are always given —
  the student saw them.
- An unmarked essay keeps the attempt's mark back ("waits for marking"), even when the mark
  is released; a provisional mark is shown to authors only.
- The student's attempt list (`…/attempts/mine`) carries per attempt `review.available` and
  `review.score` under the same rule.

### A mark kept back is kept out of the gradebook too

`/me/assessment-results` (the student's gradebook and the course page's coursework list)
leaves out a quiz's row while its `overallMark` is not released: always with _never_, until
the close with _after close_. The result is still written — teachers' views, completion and
restrictions read it unchanged. Consequences, accepted and recorded:

- A completion rule of _passed ≥ N_ ticks, and a _mark ≥ N_ restriction unlocks, as soon as
  the grade exists, so a student can infer a pass before the mark is released. Hiding those
  would make progress and access depend on a display option.
- Quiz marking sends **no notification** (CB7 sent none on close either), so nothing pushes
  a hidden mark; the personal-data export still lists every stored result, as the record of
  what is held about the person.

### Teacher marking: a mark per question that stands

`quiz_attempt_questions` gains `manual_mark`, `marked_by_id`, `marked_at` and `comment`. The
effective mark is `manual_mark ?? auto_mark`.

- `PUT …/attempts/:id/questions/:position/mark` with `{ mark, comment }`, authors only
  (`403`), a closed attempt only (`409 QUIZ_ATTEMPT_NOT_FINISHED`), `0 ≤ mark ≤` the
  question's mark (`400 QUIZ_MARK_OUT_OF_RANGE`, and a check constraint). An essay takes an
  optional comment; changing an **automatic** mark requires the reason
  (`400 QUIZ_OVERRIDE_REASON_REQUIRED`), stored as the comment. `mark: null` takes the
  teacher's mark away: an essay waits for marking again, any other question goes back to its
  automatic mark.
- Each act recomputes the attempt (raw marks, points, needs-marking), writes the student's
  quiz grade by the grading method, and recomputes completion, so restrictions follow on the
  next read. When no attempt is final any more, the grade is **withdrawn** (soft-deleted)
  rather than left stale. A grade that does not change is not rewritten.
- Audit, as assignment marking does it: the marker and the time on the question, and the
  marker as `graded_by_id` on the result. No audit-log event — assignment marks have none.
- The marking queue is `GET …/attempts?needsMarking=true` (paged, filtered by student), and
  `GET …/attempts/:id/marking` gives authors every answer, key, automatic and hand mark.

### Regrade: explicit for a key, automatic for the grading method and maximum

- **A changed key** is a new question version (ADR 0050); attempts keep the version they
  were asked. `GET …/quizzes/:id/regrade` previews, `POST` applies: every closed attempt
  that asked an earlier version of a question is moved to the latest version and marked
  again from its saved response. The preview counts attempts and students that change and
  the largest rise and fall in a grade. Running in progress attempts are left; they close on
  the version they hold and can be regraded then.
- A version whose number of choices (choice types) or of pairs and distinct answers
  (matching) differs cannot be applied to the saved indices; such questions are **left as
  they were and counted** (`incompatible`).
- **A teacher's mark survives regrade.** The automatic mark is recomputed and the version
  moves, but `manual_mark` stands; to let the new key decide, the teacher takes their mark
  away.
- Idempotent by construction: after a regrade no closed attempt asks an earlier version, so
  a second call finds nothing. Serialised per quiz by a transaction advisory lock.
- **Changing the grading method or the maximum** recomputes every closed attempt's points
  and every student's grade in the same transaction as the settings change. It needs no
  preview — it is the setting the teacher just chose, as in Moodle.
- A changed slot mark does not touch attempts (each attempt keeps the mark it was asked
  with, ADR 0051) — noticed, not built.

### Results by question

`GET …/quizzes/:id/results` pages the questions closed attempts asked (grouped by question
across versions, ordered by first position, filtered by name or text): attempts, fully right
(effective mark = the question's mark) and its share among marked answers, average mark and
average worth, waiting for marking, and for single choice, multiple choice and true/false
how often each option was picked — choices matched by text across versions, so a dropped
choice still shows its count.

## Consequences

- Hidden-mark rules live in two places by necessity: the review response and the gradebook
  query. Both are tested at the option × timing boundary.
- The review, marking and results reads load what one quiz holds; a regrade loads every
  closed attempt of the quiz in memory, which is fine for a course and would need batching
  for a quiz taken by thousands.
