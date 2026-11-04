# 0046 — Access is restricted by conditions the server evaluates per student

Status: accepted
Date: 2026-10-23

Step CB4 of `docs/Course Builder Plan.md`. Builds on ADR 0043 (sections), ADR 0044
(availability windows) and ADR 0045 (completion).

## Context

A teacher could hide an item or give it a window, but could not say "week 5 opens once you
have passed Assignment 1" or "these exercises are for seminar group S1". Moodle calls it
_restrict access_. Unlike a window, the answer differs per student, so it cannot be decided
by the item alone.

## Decision

- **A `restriction` per section, material and assignment**, a nullable `jsonb` column on
  each table (migration `0038`). Null means unrestricted. The stored shape holds ids only;
  titles and group names are read when it is shown, so a rename shows straight away.
- **Four condition types**: another item is _complete_ (CB3's recorded state: `complete`
  or `complete_pass`; a fail does not count), a _mark_ of at least N points in an
  assignment (a marked `assessment_result`, in points like the pass mark), a _date_ (on
  or after, inclusive, the server's clock as in ADR 0044), and membership of a _study group_
  of the course's offering. CB9 adds the roster-side view for groups; the condition works
  now.
- **All or any, with one level of grouping.** A restriction is a list of conditions under
  `all` or `any`; a condition may itself be a group of plain conditions with its own
  `all`/`any` ("after 3 November, or both in S1 and at least 50 in the quiz"). Deeper
  nesting is refused (`400 RESTRICTION_CONDITION_INVALID`): no real course needed it and
  every level costs the editor and the explanation. At most ten conditions per list.
- **Show or hide is per restriction, not per condition.** `hideWhenLocked` makes a locked
  item absent for a student who does not meet it; otherwise they see the title and what is
  still needed. Moodle's per-condition eye has awkward rules under `any`; one switch says
  the same thing for the cases that matter (a group-only item is usually hidden).
- **What a locked student sees**: the title and `restriction` with `locked: true` and only
  the conditions still unmet (all of them under `any`). Every other content field is
  blanked, as for a scheduled item. A locked section shows its title and reasons and none
  of its contents. Every by-id path answers 404: the assignment, its submissions, upload
  tickets and hand-ins, a material download, a view, a tick.
- **Authors see everything**, with the whole restriction described (`locked: false`), so
  the badge reads the same sentences.
- **One `AvailabilityService`** (`learning-availability.service.ts`) replaces CB2's
  `sift`/`isOpenTo` in `LearningOutlineService`. It loads, once per request, the space's
  sections, and — only if any restriction is in play — the student's facts (completed
  items, marks, group memberships: three queries) and the names the restrictions refer to
  (up to three queries), then decides every row with the pure `AvailabilityLens`. No query
  runs per item or per condition. Every read path calls it: the outline lists, by id,
  download, submissions and hand-in, views and ticks, progress, and `/me/deadlines` (and
  through it the calendar and the iCalendar feed), which keeps its SQL for windows and asks
  the service only about rows that are restricted, once per course page.
- **Progress counts only what the student can open** (unchanged from ADR 0045): a locked
  item is not counted until it unlocks, and the total grows when it does.
- **Cycles are refused** when a restriction is saved or an item moves section:
  `400 RESTRICTION_CYCLE`. The graph has an edge from an item to its section (a locked
  section locks its contents) and from anything to the items its conditions name, so "A
  waits for B waits for A", "A waits for itself" and "a section waits for something inside
  it" are all caught.
- **Targets are checked when saved**: the item must be part of this course
  (`RESTRICTION_TARGET_UNKNOWN`), a _complete_ target must have a completion rule
  (`RESTRICTION_TARGET_UNTRACKED`), a threshold may not exceed the assignment's points
  (`RESTRICTION_THRESHOLD_ABOVE_MAXIMUM`), a group must belong to the offering.
- **A removed target fails closed.** Removing an item or a group does not touch the
  restrictions that name it. The condition can no longer be met, so the item stays locked;
  the student reads "Complete an item that has been removed", the author sees the same
  flagged as `missing` and fixes it. Reads never break, because names are looked up and
  facts join to live rows. Re-saving a restriction that still names the removed target is
  refused. Opening the item to everyone instead would turn deleting a quiz into publishing
  what it guarded, and a group-only item into one for the whole course.

## Notifications

_Assignment published_ (ADR 0044) is now claimed in two ways:

- An assignment with no restriction on it or its section is claimed exactly as before.
- A restricted one is evaluated per enrolled student by the same service. While no student
  can open it, it stays unclaimed and the one-minute sweep looks again. Once at least one
  can, it is claimed and announced **to those students only**.

**The limit:** a student who unlocks it later is not told; they find it on their outline,
deadlines and calendar as soon as it opens. Telling each student at their own unlock needs
an announcement per student (a table keyed by assignment and user) and a trigger on every
completion, mark, membership and date — recorded as future work. An unannounced restricted
assignment is re-evaluated on every sweep until someone can open it; the sweep reads at most
200 such candidates, ordered by deadline.

## Consequences

- `LearningSpaceContext` now carries the caller's `userId`: availability is per person.
- A restriction on an item whose completion rule is later set to _none_ can no longer be
  met; nothing warns the author yet.
- Search still indexes no materials or assignments (ADR 0044); when it does, it must ask
  `AvailabilityService`.
