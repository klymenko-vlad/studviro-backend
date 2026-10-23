# 0044 — Availability is a window the server reads from its own clock

Status: accepted
Date: 2026-10-23

Step CB2 of `docs/Course Builder Plan.md`. Builds on ADR 0043 (sections) and ADR 0028 (an
assignment's `opensAt`, and the server deciding lateness).

## Context

A teacher could hide or show an item, but could not say "this opens on Monday" or "this goes
away after the exam". Moodle calls it _available from / until_. The plan also carried a
notification gap from CB1: _assignment published_ fired when an assignment was shown even
if its section was hidden, and nothing fired when the section was shown later.

## Decision

- **`available_from`, `available_until` and `hidden_until_available`** on
  `learning_sections`, `learning_materials` and `learning_activities`. Either date may be
  null (open at that end). From is inclusive, until is exclusive; a window that ends before
  or as it opens is `400 AVAILABILITY_WINDOW_INVALID`. Migration `0036`.
- **Availability is about seeing; `opensAt` stays about handing in.** An assignment can be
  visible on Monday and open for submissions on Wednesday.
- **The server decides, on its own clock.** Every response carries `availability`
  (`scheduled`, `open` or `ended`, for the item's own window) and the dates. The client renders
  that answer and never compares dates itself.
- **What a student sees** (one rule, `sightOf` in `learning-outline.service.ts`, built on
  `ownSight` in `learning-availability.ts`):
  - inside the window: everything;
  - before it: the title and "Opens on …", with every other field blanked (a material's
    description, body, URL and file; an assignment's brief and dates) — or nothing at all
    when the author ticks _hide it completely until then_;
  - after it: nothing.
    A not-yet-open item is closed on every by-id path: the assignment by id, its submissions,
    an upload ticket, a hand-in and a material download all answer 404.
- **A section's window covers everything in it.** Before a section opens a student sees its
  title and opening date and none of its contents; after it ends, neither. An item's own
  window still applies inside an open section.
- **Every read path from principle 1:** the outline lists, by id, download, submissions,
  `/me/deadlines` and therefore the calendar and the iCalendar feed (the deadline query
  applies the same windows in SQL, `learning-availability.sql.ts`). A deadline appears only
  once the student can open the assignment — a title-only item has no dates to show.
  **Search** does not index materials or assignments, so it has nothing to filter; when it
  does, it must use the same rule. A teacher's own deadlines and calendar keep scheduled
  assignments: they teach them.
- **Teachers see badges**: "Opens …", "Hidden until …", "Ended …", "Until …".
- **"Assignment published" fires once, when students can first see the assignment.**
  `learning_activities.announced_at` records that it has been announced. An assignment is
  announced when it is visible, its section is visible and open (or it has none), its own
  window is open, its course page is published, and its deadline is still ahead. Two paths
  reach that rule, both through `AssignmentAnnouncementsService`:
  - **straight away**, in the same transaction as the change that made it visible — creating
    or editing the assignment, editing its section, publishing the course page;
  - **a sweep every minute** (`AssignmentAnnouncementSweepService`, `@nestjs/schedule`) for
    what becomes visible by the clock alone, when an `available_from` passes.
    The claim is one `UPDATE … WHERE announced_at IS NULL … RETURNING`, so two replicas
    running the sweep at once cannot both announce the same assignment. Hiding and showing
    again does not announce again. _Deadline moved_ is sent only for an assignment that was
    announced.
- Migration `0036` marks every existing visible assignment with a deadline as already
  announced, since the old rule had already told students about it. The demo seed does the
  same for what it writes.

## Alternatives considered

- **A delayed BullMQ job per assignment, scheduled for its `available_from`.** Exact to the
  second, but every edit of the date, the section or the visibility would have to find and
  replace the job, and a lost job is a lost notification. A sweep reading the table is
  self-healing and a minute late at worst.
- **Computing availability in the client.** Rejected by principle 2: the browser's clock is
  the user's, and the rule would have to be kept in step in two places.

## Consequences

- A notification for something that opens by the clock can arrive up to a minute late.
- A deadline moved on an announced assignment whose section is hidden is still announced as
  moved, since students were told of it; one moved while the assignment itself is hidden, or
  never announced, is not.
- Marks stay on `/me/assessment-results` after an assignment's window ends, as they do for a
  hidden one (ADR 0043).
