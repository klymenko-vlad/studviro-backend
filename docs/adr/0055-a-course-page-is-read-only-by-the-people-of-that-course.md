# 0055 — A course page is read only by the people of that course

Status: accepted
Date: 2026-10-26

## Context

ADR 0028 split callers into author, participant and observer, and ADR 0031 let every
teacher pass the `offering:read` guard for the whole institution on the understanding that
the per-course stance would refuse them anything that was not theirs. The stance did refuse
authoring, and an observer could not see what was unpublished or hidden, but nothing refused
an observer the rest. A teacher of another course, or a student not enrolled on it, could
read a published course page, its sections, materials, assignments and quizzes through the
API while the course page in the client said _not yours to see_ (tracker B43).

## Decision

- **An observer is refused the course page** with `403 LEARNING_SPACE_NOT_YOURS`, at the one
  place every learning read passes through: `LearningAccessService.contextForSpace`.
- **Unless they administer enrolment or offerings at the institution** (`offering:manage`
  or `enrollment:manage`), the same test the course page uses to show its administrator
  view. A registrar reads a course page and still cannot change it.
- **Asking which page is on an offering** (`GET …/learning-spaces?offeringId=`) is refused
  the same way, so the space's name and summary do not leak either.
- **An unpublished page stays a 404** for everyone who cannot author it. The visibility
  check runs first, so a stranger cannot tell an unpublished page from a missing one.

## Consequences

The client needed no change: every screen that reads a course page sits behind the course
page's own check, which already refused these callers.

Course discussion (ADR 0040) already refused observers, registrars included, and still does;
reading a discussion is taking part in it, which a registrar does not.
