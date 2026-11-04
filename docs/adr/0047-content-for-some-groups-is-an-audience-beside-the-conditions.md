# 0047 — Content for some groups is an audience beside the conditions

Status: accepted
Date: 2026-10-23

Step CB9 of `docs/Course Builder Plan.md`. Builds on ADR 0046 (restrict access).

## Context

ADR 0046 already has a _study group_ condition, so a teacher could restrict a worksheet to
seminar S1 by building a restriction by hand. CB9 asks for a first-class, simple control for
that, which must not clobber a restriction already on the item, plus the view of who can see
an item and, from the roster, what is restricted to a group.

The obvious design — the Groups control writes a group condition into the conditions — fails
on the commonest real case. A restriction has one _hide while locked_ switch (ADR 0046), so
"for S1 only, and unlocked after Assignment 1" can either hide the item from S1 students who
have not done Assignment 1 yet, or show S2 students a locked item they will never open. A
teacher wants other groups not to see it at all and their own group to see the lock.

## Decision

- **An audience beside the conditions, in the same `restriction` jsonb.** A restriction may
  carry `audience: { groupIds, hideFromOthers }`: one to ten study groups of the offering,
  and what students in none of them see. No migration: the column is already jsonb, and an
  item that is only for some groups is still restricted, so every fast path that skips
  unrestricted items (deadlines, announcements, facts loading) stays correct untouched.
  A restriction may now have no conditions when it has an audience.
- **The audience is ANDed with the conditions, and checked first.** A student in none of
  the groups is _outside_: they see nothing (`hideFromOthers`) or the title and "Only for
  group S1" — never the other conditions, which are not theirs to meet. A member is then
  held to the conditions as before, under their own _hide while locked_ switch. One
  `verdictOf` decides both, so every read path in ADR 0046 applies it.
- **Two controls, two halves, neither clobbers the other.** `PATCH` takes `audience` beside
  `restriction`. Writing one keeps the other; `restriction: null` removes the conditions and
  keeps the groups, `audience: null` the reverse; when both are gone the column is null.
  Each half is validated only when it is written, so an unrelated edit is not refused
  because the other half names something removed. The _group_ condition stays in the
  conditions for compound rules ("in S1, or at least 50 points").
- **A removed group fails closed**, as ADR 0046 decided for every target. Removing a group
  ends its memberships, so nobody is in it and the item stays closed to its former members;
  the author sees the group flagged `missing`; saving the audience again with it is refused
  (`RESTRICTION_TARGET_UNKNOWN`). Membership changes are read on every request, so they
  take effect on the next read; nothing is cached.
- **Who can see this** — `GET …/learning-spaces/:spaceId/sight/:kind/:id`, for authors.
  For each enrolled student: `full`, `title` or `none`, and why not — `hidden` by the author,
  `scheduled` (with the date), `ended`, or `locked` with the unmet conditions or groups —
  and whether the item or its section is the cause. The reason is given to the author even
  when the student is shown nothing. It is batched: the sections, the facts for every
  enrolled student (three queries) and the names (up to three) are read once and the pure
  lens runs per student. Counts are over every student; the rows are a page with a name or
  email filter, like the completion table.
- **A group's content** — `GET …/course-offerings/:offeringId/study-groups/:groupId/content`,
  for authors: every section and item whose audience or conditions name the group, with how
  (`audience`, `condition`), in outline order, a page at a time and filtered by title. The
  client links each to its place on the course page by an anchor.

## Consequences

- A teacher has two ways to say "for group S1": the Groups control (the usual one) and a
  group condition (for compound rules). The badge and the student sentence read the same.
- An item can now be restricted and have no conditions; clients must read `audience`.
- A group's content list filters jsonb by text containment of the group id and pages in
  memory after ordering; fine for a course page, not for a whole institution.
