# 0048 — A student view is the student's own read, answered for an author

Status: accepted
Date: 2026-10-23

Step CB11 of `docs/Course Builder Plan.md`. Builds on ADRs 0043–0047.

## Context

After CB2–CB9 a course page differs per student: hidden, scheduled, locked and group-only
items, and progress. An author could see every item with its badges and, per item, who
could open it (ADR 0047), but not the page as a whole as one student meets it. Moodle's
answer is _switch role to student_. The plan asks for it read-only and without
impersonation.

## Decision

- **One read, `GET …/learning-spaces/:spaceId/student-view`**, answering sections,
  materials, assignments and progress together. The client builds the outline from four
  separate reads; a flag on each of them would have been four places to check authorship
  and four ways to forget it. One endpoint checks it once.
- **It is the student's own read, not a copy of it.** Each list service now takes a
  `LearningSpaceContext` (`listFor`, `forContext`); the student routes build that context
  from the caller, the student view builds it as `participant` for the student and calls the
  same methods. The e2e suite asserts the preview equals the student's own four reads for
  the same user, so it cannot drift.
- **Two modes.** `?asStudent=<userId>` shows the page as that enrolled student, with their
  progress, groups, marks and completions. Without it, a student with no progress and in no
  group: the same context for a user id that matches no row (the nil UUID), so every fact
  is empty. That is what a student enrolled today sees.
- **Who may ask**: anyone who authors the course (teaches it, or administers offerings),
  checked by `LearningAccessService` as for every authoring act; `403` to everyone else.
  `asStudent` must hold a participating enrolment on the offering; `404` otherwise,
  including for the author themselves and for a withdrawn student.
- **Read-only by construction.** It is a `GET` that only lists; nothing records a view, a
  tick or a hand-in, and no session changes hands. The client renders the outline with a
  read-only flag: _Mark as done_ disabled, no download button, no view recorded when a note
  shows inline, the assignment title not a link into the author's own Assignments tab.
- **The picker** is `GET …/student-view/students`, the enrolled students a page at a time,
  filtered by name or email — the same paging as the completion table and the sight report.
- **An unpublished page** is shown as it will be once published: the preview is for the
  author building it, and a real student would get a 404 for the whole page.

## Consequences

- The Assignments tab has no student view yet; the outline already shows every assignment
  as the student meets it, with its due date. Recorded under _Noticed_.
- A future read path a student has (a quiz, a page kind) needs a `…For(context)` method to
  appear in the preview; leaving it out shows as a missing part, never as a leak.
