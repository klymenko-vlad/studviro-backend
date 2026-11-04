# 0044 — Students can find any teacher

Status: accepted
Date: 2026-10-23

## Context

Search treated people as the most sensitive thing it could return and searched them only
for `role:read`, which no student holds. A student typing a teacher's name got nothing,
plus a note that people were not searched. A person hit also led to the administrators'
People screen, which a student cannot open, so widening that kind would only have
produced links that answer 403.

A university already publishes who teaches there and how to reach them. A student needs
that to write to a teacher before enrolling, or to a teacher of a course they took last
year.

## Decision

- **A `teacher` search kind, for `course:read`**, which every student holds. It matches
  name or e-mail among users with a live teaching assignment in the institution. Anybody
  without one is never returned, so the box does not become a directory of every account.
- **A reader who already searches `person` does not also search `teacher`**, so an
  administrator does not get the same teacher twice.
- **A teacher profile**, `GET /institutions/:id/teachers/:userId`, also for `course:read`:
  name, e-mail and the departments of the courses they teach. The courses themselves are
  `GET …/teachers/:userId/offerings`: newest term first, keyset-paged and filtered by
  title or code (`q`), since a long-serving teacher's list has no natural end. Both
  answer 404 for anybody who teaches nothing here,
  including a user who exists, so it cannot be used to test whether an account exists.
- **Each course says whether the reader can open it** (`viewerCanOpen`): the same rule
  as the course page, i.e. they teach it, hold a recorded enrolment on it, or administer
  offerings. The client links only those, so the profile never leads to a 403.

## Consequences

- A teacher's name and e-mail address are visible to every member of their institution.
  That is the personal data a staff directory exists to publish. Nothing else about the
  teacher is exposed, such as roles, the people they teach or grades.
- Every teaching role counts (lecturer, seminar leader, lab supervisor, examiner,
  assistant), so a teaching assistant is found as a teacher.
- There is still no directory of students or of staff who teach nothing.
