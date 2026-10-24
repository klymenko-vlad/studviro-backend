# 0028 — The learning half: spaces, materials, assignments, submissions, marking

Status: accepted
Date: 2026-09-19

Closes steps L2–L6 of `docs/Product Plan.md` on the backend, and settles L7. Builds on
ADR 0027, which decided where bytes live. Supersedes ADR 0020's account of the learning
tables, which described them as a mirror of somebody else's course.

## Context

The canonical learning tables — `learning_spaces`, `learning_activities`, `assessments`,
`assessment_results`, `activity_completions`, `submission_refs` — were designed against
Moodle's semantics so that a synchroniser could land Moodle's rows in them. It shows.
`learning_spaces.url` pointed at a Moodle course page. `learning_activities.url` pointed at
a Moodle activity. `submission_refs` was named for what it held: a _reference_ to a
submission that lived somewhere else, with a `url` and a `file_count` and none of the work.

ADR 0024 removed the thing on the other end of those pointers. Since then the tables have
been readable and unwritable: `docs/Feature Status.md` could say a student sees their
deadlines, and could not say anybody had ever set one.

So the question this decision answers is not "what should the learning model be" — twenty
five tables of it already exist and are good — but "which of it was about Moodle, and what
does StudViro own instead".

## Decision

### What was repurposed

**`learning_spaces` stays, and becomes authored.** `url` is gone; `summary` replaces it. A
space is created against an offering, at most one per offering — the partial unique index
always said so, and now `LearningSpaceAuthoringService` says it on the way in with
`LEARNING_SPACE_EXISTS` instead of letting Postgres say it on the way out. A new space is
**unpublished by default**, because a course is built before it is shown.

**`learning_activities` stays, and becomes the assignment.** `url` is gone; `brief` replaces
it, and `max_attempts` and `allows_late_submission` join the three date columns the table
already carried. Those three dates — `opens_at`, `due_at`, `closes_at` — were the clearest
evidence that this table was always about things that fall due; nothing else used them.

**`submission_refs` is renamed to `submissions`,** loses `url`, and gains `notes` and a
`file_count` that is now maintained rather than copied. The name was the last place the
integration premise was still stated in the schema, and a row that holds the student's
actual work should not be called a reference to it.

**`assessments` is the gradebook column, and every assignment gets one.** They are created
in the same transaction. Marking then has somewhere to put a mark without inventing a
column, and `assessment_results` — which `/me/assessment-results` already reads — fills up
as a consequence of marking rather than as a separate act of data entry.

### Materials are a new table, not activities of type `resource`

`learning_activities` has a `resource` member in its type enum, and reusing it would have
cost nothing today. It is the wrong shape.

An activity is _a thing to do_: it has a window, it accrues submissions, it carries a mark,
it appears in `/me/deadlines`, it has an `activity_completion`. A material is _a thing to
read_: it has a kind, and depending on the kind a body, a URL, or a storage key with a
filename, a content type and a size. Sharing one table means five columns that are null for
every assignment and six that are null for every material, an `is_this_the_kind_with_a_file`
check at every read, and a `due_at` on a PDF.

The sharper test is what the two tables are joined to. Every existing query over
`learning_activities` — deadlines, completions, the results list — is asking about work.
A material joined into those queries is noise that each one has to filter out, forever. So:
`learning_materials`, with a `kind` of `file`, `link` or `text`, an explicit `position`, and
`visible` of its own.

The cost is honest and small: a course page is two ordered lists that the client interleaves,
rather than one. That is a client concern, and the client was going to render them
differently anyway.

### Files go through `StorageService`, unchanged

Both a material and a submission take the three-step route ADR 0027 built: ask for an upload
ticket, PUT straight to the store, come back with the key. The server then calls
`confirm()`, which asks the store what it actually received — size, content type — and it is
_that_ answer, not the client's claim, that is written to the row. Nothing streams through
Nest. Reads are short-lived presigned links from `createDownloadUrl`, one endpoint per file.

### Lateness is the server's, and only the server's

`is_late` is computed inside `assertSubmittable` from the assignment's `due_at` and the
server's clock, at the moment the submission row is written. The client is not asked, and
because the validation pipe forbids unknown properties, a client that sends `isLate` is
rejected outright rather than ignored. A value the submitter controls is not a fact about
when they submitted.

The window rules, all in `assignment-policy.ts` and unit-tested there:

| Rule                                               | Code                               |
| -------------------------------------------------- | ---------------------------------- |
| Dates must run opens → due → closes                | `ASSIGNMENT_WINDOW_INVALID`        |
| An attempt limit is 1–100, or absent for unlimited | `ASSIGNMENT_ATTEMPT_LIMIT_INVALID` |
| Nothing may be handed in before `opens_at`         | `ASSIGNMENT_NOT_OPEN`              |
| Nothing may be handed in after the effective close | `ASSIGNMENT_CLOSED`                |
| Work after `due_at` needs `allows_late_submission` | `ASSIGNMENT_LATE_NOT_ALLOWED`      |
| One attempt per submission, up to the limit        | `ASSIGNMENT_ATTEMPTS_EXHAUSTED`    |

With no explicit `closes_at`, the **due date closes the assignment unless late work is
accepted**. The alternative — an assignment that is permanently past due and permanently
open — produces submissions nobody will mark.

### Who may do what

The guard on every route is a permission at institution scope, as
`test/e2e/route-permissions.e2e-spec.ts` requires. Authoring is `offering:manage`, reading is
`offering:read`, marking is `grade:propose` — all three already in the catalogue. **No new
permission was added.** A submission needs no permission of its own beyond `offering:read`,
because what makes it the student's is ownership, not standing: `submissions.user_id` is the
caller and is never a parameter.

Behind the guard, `LearningAccessService` answers a second question the guard cannot: who is
the caller _to this course_. An **author** teaches the offering or holds `offering:manage`;
a **participant** is enrolled; everybody else is an **observer**. That is what hides an
unpublished space, a hidden material and an invisible assignment from students while leaving
them visible to the teacher building them, and it is what stops the teacher of another
offering from listing or marking this one's submissions.

One consequence was worth stating plainly, and is **settled by ADR 0031** — read that
instead of what follows, which is kept only because the reasoning it got wrong is
instructive.

As first shipped: because the derived `teacher` role is scoped to an offering and
`offering:manage` is checked at the institution, a teacher who was not also a course
coordinator could not author their own course page. This ADR guessed the fix would be a
scope-aware variant of the permission guard. It was not. `teacher` carries
`offering:manage` at no scope at all, so a scope-aware check would have refused them just
the same; and the limitation was never confined to authoring — a teacher holding no granted
role was refused every institution-scoped route, and saw an empty institution.

What fixed it was making the two derivations symmetric: teaching anything at an institution
now derives a role there, as one programme membership already did for a student. Authoring
then sits behind `offering:read` with `LearningAccessService` deciding whose course it is —
which is what the paragraph above already described it doing.

## L7 — quizzes are out of scope

**Superseded by ADR 0050** (2026-10-24): quizzes are back in scope, at the user's request.
What follows is kept as the reasoning about their size, which still holds.

**No quiz engine.** Nothing in the docs asks for one: `System Plan.md` lists quizzes as a
Moodle strength and, in the same table, recommends against mapping them to anything
administrative; `Tasks Plan.md` mentions them only as a thing to _display_; the MVP exclusion
list names "rebuilding Moodle quizzes/assignments" outright.

The reason to hold the line is that a quiz is not a feature, it is a product. Doing it
honestly means a question bank with versioning, at least five question types with their own
editors and their own grading, timing and per-attempt shuffling, attempt state that survives
a closed laptop, autograding with partial credit, review rules deciding what a student may
see and when, and an accessibility story for every one of those widgets. It is comparable in
size to everything else in Phase 2 put together, and it is not what makes StudViro worth
using instead of Moodle — one record of a student's year is.

`quiz` is therefore **removed from `LEARNING_ACTIVITY_TYPES`**. Nothing depended on it: the
enum member was never written by any code path and never read by any query, and the migration
maps any historical row to `other` before narrowing the type. `forum`, `resource` and
`workshop` stay, unused, because each is a plausible future member of the same table with the
same shape; a quiz is not, and advertising it in a public enum would promise something that
will not arrive.

## Consequences

- The Moodle-shaped `url` columns are gone from three tables, and with them the fields
  `MyDeadlineResponseDto.url`, `DeadlineLearningSpaceDto.url` and `AssessmentActivityDto.url`.
  Any client rendering an "open in the LMS" link must drop it; there is no LMS.
- `learning_materials` and `submission_files` are new; both carry `institution_id`.
- Two migrations, not one: drizzle-kit crashes when a table rename and column changes on that
  table land in the same diff, so `0023` renames `submission_refs` and `0024` does the rest.
- Deleting a material or a submission leaves its object in the bucket, exactly as ADR 0027
  said it would. O4 is where that is settled, and it must sweep the bucket.
- Marking writes a working grade. The official course grade is still a separate, deliberate
  act in the results screen under `grade:publish`, and nothing here changes that staging.
- No notification is raised when an assignment is set or a mark is given, though
  `GradeNotificationsService` and the `learning_activity_id` column on `notification_events`
  are both sitting there ready. It is a small, separate step.
