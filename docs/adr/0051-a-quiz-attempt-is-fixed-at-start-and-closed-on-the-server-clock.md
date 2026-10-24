# 0051 — A quiz attempt is fixed at start and closed on the server's clock

Status: accepted
Date: 2026-10-24

Step CB7 of `docs/Course Builder Plan.md`. Builds on ADR 0050 (quizzes and the versioned
bank) and follows the attempt tables it sketched, amended as recorded below. ADRs 0044–0047
still decide who may open a quiz; this record decides what happens once they do.

## Context

CB6 made quizzes something a teacher authors. A student taking one needs an attempt that
lives on the server: what was asked must not change under them, what they answered must
survive a closed laptop, and the moment it closes must not depend on their browser. The
mark has to land in the quiz's gradebook column the way marking an assignment does, so that
completion (ADR 0045) and restrictions waiting on a mark (ADR 0046) work unchanged. CB8 will
decide what a student may review; until then a student is told nothing about correctness.

## Decision

### Tables

`quiz_attempts` and `quiz_attempt_questions` (migration `0041`), as ADR 0050 sketched, with
these amendments:

- The state is `in_progress` or `finished` (`quiz_attempt_progress`). There is no
  `abandoned`: an attempt past its deadline is submitted with what was saved (Moodle's
  default _open attempts are submitted automatically_), so nothing is ever left unmarked.
- **`deadline_cause`** (`time_limit` or `quiz_close`) is stored beside `deadline_at` at start,
  and **`closed_by`** (`student`, `time_limit`, `quiz_close`) when it closes. A check keeps
  `finished_at` and `closed_by` set exactly when the attempt is finished.
- **`max_marks`** (the marks of the questions actually asked), **`missing_questions`** and
  **`needs_marking`** are on the attempt. `raw_marks` and `points` are written when it closes.
- The per-question shuffle is `presented_order` (`jsonb`: `choices`, or `prompts` and
  `answers` for matching). The answer is `response` (`jsonb`), with `answered_at` and
  `auto_mark`. `manual_mark`, `marked_by_id`, `marked_at` and `feedback` are left for CB8,
  which needs them; nothing here would use them.
- A partial unique index allows **one attempt in progress per student per quiz**; attempt
  numbers are unique per student per quiz.

### Starting

`POST …/quizzes/:quizId/attempts`, for an enrolled student only (`403
QUIZ_ATTEMPT_STUDENTS_ONLY` for anyone else — an author previews with _View as a student_,
not by taking it). A quiz the student may not open (hidden, scheduled, locked, another
group's) is `404`, on this and every attempt route.

If an attempt is already in progress it is returned, not a second one started. Otherwise the
start is refused when the quiz has not opened (`409 QUIZ_NOT_OPEN_YET`), has closed
(`QUIZ_CLOSED`), the attempt limit is used (`QUIZ_NO_ATTEMPTS_LEFT`) or it asks nothing
(`QUIZ_HAS_NO_QUESTIONS`). Starts are serialised per student and quiz by a transaction-level
advisory lock, so two tabs cannot open two attempts.

At start, everything is fixed and stored: each slot resolved to its question's **latest
version** (ADR 0050), random draws made, the questions shuffled if the quiz says so, the
choices shuffled if it says so, and **a matching question's answers always shuffled** — in
key order they would give the pairs away. Shuffles use `crypto.randomInt`.

### A draw that comes up short

A random slot draws distinct questions from its category's live questions, excluding those
the quiz asks by hand and those an earlier draw in the same attempt took. If questions were
removed or moved out after the slot was saved (ADR 0050 checks only then), the attempt
**draws what there is** and records the shortfall in `missing_questions`. The attempt is
marked out of the questions it asked (`max_marks`), so a short draw neither penalises the
student nor is hidden from them — the attempt screen says how many could not be drawn. Only
an attempt that would ask nothing is refused.

### Answering

`PUT …/attempts/:attemptId/answers/:position` saves one answer, as given: the last write
stands and repeating it changes nothing. The body names the part that fits the question
(`choice`, `choices`, `value`, `text`, `pairs`); anything else, a choice not shown, or a
prompt answered twice is `400 QUIZ_ANSWER_INVALID`. An empty answer clears it. Text is kept
as typed (500 characters, an essay 50 000); a numerical answer is typed text, read as a number
when marked, accepting a decimal comma.

The response carries `remainingSeconds` on the server's clock, so every save re-syncs the
client's timer. Reading the attempt returns the questions with the saved answers and the time
left, which is how a reload, or another device, carries on.

### Closing

An attempt closes at whichever comes first: the student's submit, the time limit or the
quiz's close — `deadline_at = min(started_at + time limit, close)`, fixed at start. A later
change to the quiz's settings does not move a running attempt's deadline.

- **No grace period.** An answer that arrives at or after `deadline_at` is refused with `409
QUIZ_ATTEMPT_CLOSED`, and the attempt is closed on the spot; an answer one millisecond
  before is taken (tested at the boundary). Moodle's grace period exists for attempts that
  need a person to submit them; here the client saves as the student goes and the server
  submits on time, so the most that can be lost is the last pause in typing.
- A past-deadline attempt is closed on the next read or write that touches it — the
  student's attempt, their list, a start, the authors' list — and by a **one-minute sweep**
  (`QuizAttemptSweepService`, the CB2 sweep pattern), so it closes even if nobody comes back.
  It closes as of its deadline (`finished_at = deadline_at`, `closed_by` its cause).
- Submitting an attempt that has already closed returns it as it closed.

### Marking on close

Each question gets an automatic mark (`autoMarkOf`), rounded to four decimals:

| Type            | Mark                                                                      |
| --------------- | ------------------------------------------------------------------------- |
| single choice   | the mark if the choice picked is correct                                  |
| multiple choice | +mark/ncorrect per correct choice picked, −mark/nwrong per wrong one, ≥ 0 |
| true / false    | the mark if it matches                                                    |
| short answer    | the mark if it equals an accepted answer, trimmed, case per the key       |
| numerical       | the mark if within the tolerance of the value                             |
| matching        | mark × pairs right / pairs                                                |
| essay           | none — the attempt **needs marking** (CB8)                                |

Multiple choice is Moodle's usual setup: picking every choice scores nothing. An unanswered
question scores nothing.

`raw_marks` is the sum; `points` is it scaled to the quiz's gradebook column
(`raw / max_marks × assessment max`), as Moodle's maximum grade. While an essay is unmarked
both are **provisional**: shown to authors so marked, and kept out of the gradebook.

### The grade and what follows from it

After every close, the quiz's `assessment_results` row for that student is written from
their finished attempts by the grading method — highest, last or average — **over attempts
whose marks are final**. An attempt that needs marking joins when CB8 marks it, as Moodle
leaves an attempt needing grading out of the quiz grade. If no attempt is final, no result is
written. The result has no marker (`graded_by_id` null) and its `graded_at` is the close.
The upsert is `AssessmentResultsRepository`, now shared with assignment marking.

Completion is then recomputed for the student: _submitted_ is the first finished attempt,
_marked_ and _passed ≥ N_ read the result like an assignment's. So a restriction waiting for
the quiz unlocks on the next read, and progress moves. No notification is sent: the student
has just submitted.

### What a student is told

The attempt routes give a student the question text, its mark and the choices, prompts and
answers as texts in their shuffled order — never which is right, a key, feedback, a mark
earned or a score. A closed attempt comes back with no questions at all. The student's own
list (`…/attempts/mine`, paged, filtered by state) gives each attempt's number, state and
times, and whether another may start and if not why. The quiz grade reaches the student only
where any mark does — the gradebook — as an assignment's does. CB8 decides review.

### What authors see

`GET …/attempts` lists every attempt at the quiz, newest first, paged and filtered by student
(name or e-mail) and state, with the provisional or final score. Marking is CB8.

### One question per page, or all on one

`quizzes.layout` (`one_per_page`, the default, or `all_on_one`) is a quiz setting, set on the
quiz page. It decides only how the client lays out the attempt.

## Consequences

- Changing the grading method, the maximum or a question's key does not regrade attempts
  already closed. Regrading is CB8's explicit act.
- A deadline fixed at start means extending a quiz's close does not extend a running
  attempt; the student starts a new one if attempts remain.
- A student whose access is taken away mid-attempt (the quiz hidden, the group changed) loses
  the attempt screen at once; the attempt still closes at its deadline and is marked.
- Removing a quiz keeps its attempts. A removed slot leaves its asked questions in place
  (`slot_id` becomes null).
