# 0043 — A course page is an outline of sections

Status: accepted
Date: 2026-10-22

Step CB1 of `docs/Course Builder Plan.md`. Amends ADR 0028, which settled that materials
and assignments are two tables and left the client to interleave them.

## Context

A course page was one flat list of materials, with assignments on a separate tab. A
teacher could not say "week 1 is these slides, this reading, then this exercise". Moodle's
course page is an outline of sections (topics or weeks), and the user asked for courses a
teacher builds step by step, the Moodle way. Sections are the structure the rest of that plan
builds on: scheduled availability, completion and conditional release all apply to a section
as well as to an item.

## Decision

- **`learning_sections`** belong to a learning space: a title, a summary, a `position` and a
  `visible` switch of their own. `learning_materials` and `learning_activities` gain a
  nullable `section_id`. Null is the **general area** at the top of the page, Moodle's
  section 0, so a course with no sections reads exactly as it did before.
- **Materials and assignments keep their own tables** (ADR 0028's reasoning still holds),
  but **share one ordering inside a section**. A new item is placed after the highest
  position across _both_ tables in its section; the client sorts the merged list by
  position. A move is still a swap of two positions, across kinds as well as within one.
  Migration `0035` renumbers existing assignments to sit after their space's materials,
  which is where the old page showed them.
- **Moving an item to another section** is a `PATCH` of `sectionId`; without an explicit
  `position` it lands at the end of the target. A `sectionId` that is not this space's is
  `400 LEARNING_SECTION_UNKNOWN`, not a 404: the item exists, the reference is wrong.
- **A hidden section hides everything in it**, from everyone who is not an author, on every
  read: the material and assignment lists, an assignment by id, a material download, the
  caller's own submissions, and `/me/deadlines`. The item's own `visible` is unchanged, so
  showing the section again restores exactly what was showing before. The rule is one
  function, `shownTo` in `learning-outline.service.ts`; the deadline query applies the same
  rule in SQL.
- **Removing a section keeps its contents.** They move, in their order, to the end of the
  general area. Moodle deletes a section's activities with it; here, a mistaken removal costs
  nothing but a section title, and nothing a student handed in is ever at risk from
  restructuring a page.
- No new permission. Sections sit behind `offering:read` with `LearningAccessService`
  deciding who authors, exactly as materials do (ADR 0031).

## Consequences

- A section's `position` is a plain integer, like a material's, with no uniqueness: two
  equal positions sort by creation time. Reordering stays a swap.
- `assignment_due_published` still fires when an assignment is shown even if its section is
  hidden, and nothing fires when a hidden section is later shown. CB2, which adds
  availability dates, owns notifications about when a student can first see something.
- Marks are unaffected: `/me/assessment-results` shows a student their own marks whether or
  not the assignment is currently shown, as it did before sections.
