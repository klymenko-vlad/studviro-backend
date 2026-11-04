# 0053 — A course page is reused by copying it into the new term

Status: accepted
Date: 2026-10-24

Step CB10 of `docs/Course Builder Plan.md`, the last one. Builds on ADRs 0043–0052: every
thing a course page can hold is copied, and the rules each of them set still hold for the
copy. ADR 0050 already decided that the question bank is per course page and that this step
copies it rather than sharing it.

## Context

Every offering started empty. A teacher who taught Algorithms last winter rebuilt the page
by hand for this winter: the sections, every file, the assignments with their dates, the
quizzes and the bank. Moodle's _import_ copies one course's content into another and is the
thing that makes the second year cheap. The copy must not carry anything a student did,
must not share stored files between two pages (removing one would break the other), and
must move every date into the new term.

## Decision

### What is copied

- **Sections** (title, summary, visibility, window, _hide until available_, restriction and
  audience), **materials of every kind** (ADR 0049) with their content and completion rule,
  **folder files**, **assignments** (brief, window, attempts, late hand-in, completion rule and
  pass mark) each with a **new gradebook column** (points, weight, counts toward the final
  grade), **quizzes** with their settings and review options (ADR 0052) and their **slots**,
  and the **question bank**: every live category, and every live question's _latest_ version
  as version 1 of a new question. Slots are pointed at the copied questions and categories;
  a slot whose question or category was not copied is dropped and flagged.
- **Nothing a student did**: no submissions, marks, completions, views, quiz attempts or
  discussion posts. `announced_at` starts empty, so _assignment published_ fires for the copy
  when students can first see it (ADR 0044). The e2e suite asserts each of these is empty
  for the copy and unchanged on the source.
- The copier is the author: copied materials and questions are created by them.

### Files are copied in the store

Each file material and folder file is copied server-side (`CopyObject`) to a **new key under
the institution's `materials/` prefix** with the same name label, through `StorageService.copy`,
which refuses a source or target key of another institution. The copy keeps the source's
scan status — the bytes are identical.

- **Only `clean` and `unscanned` files are copied.** `unscanned` is what an institution that
  runs without a scanner has (ADR 0042), and refusing it would make import useless there.
  A file still **`pending`** is left out and flagged _not yet checked — import again once it
  has been_; an **`infected`** one, or one whose object was reclaimed, is left out and
  flagged. A file material left out is not copied at all, so a condition waiting for it
  points at nothing and fails closed (below).

### Dates move by the gap between the terms' starts

The shift is `target term starts_at − source term starts_at`, to the millisecond, so a term
that starts on the same weekday keeps every deadline on its weekday and hour. It applies to
every window (`available_from` / `until` of sections, materials, assignments and quizzes),
an assignment's `opens_at`, `due_at` and `closes_at`, a quiz's open and close, and every
_date_ condition in a restriction. `academic_terms.starts_at` is required, so a term always
has a start; a course page **with no offering** has no term, and then nothing moves — the
report says so (`dateShift.applied: false`).

### References are remapped

- _Complete_ and _mark_ conditions point at the copies (`itemKind` kept as written, so a
  stored _mark_ condition without one still means an assignment).
- A condition naming something that was **not copied** keeps its old id. It names nothing on
  the new page, so it **fails closed and shows as removed**, exactly as ADR 0046 decided for
  a removed target, and the item is flagged _waits for something that was not copied_.
- **Study groups** (in _group_ conditions and in an audience) are matched to the new
  offering's groups **by code, then by name**, case-insensitively. A group with no match is
  dropped from the condition or the audience — an emptied group set or audience goes with
  it — and **the item is hidden**, whatever the visibility choice, because dropping a group
  part can only widen who sees it. The report names each one.

### Appended, never overwritten

Copied sections go **after the page's existing sections**, in their source order; items
outside a section go after the general area's existing items. Nothing on the page is
changed or removed, so an import into a page that already has content is safe, and a
second import adds a second copy. A copied category whose name the bank already holds is
renamed `Name (2025W)` (the source term's code, then numbered) and flagged.

### Hidden by default while the author reviews

By default (`visibility: hidden`) **every copied section and every item copied outside a
section arrives hidden**; items inside a section keep their own setting, so showing a
section shows exactly what the source showed in it. Moodle keeps the source's visibility;
here a copy lands in a term students are already enrolled on, with last year's titles and
possibly unreviewed dates, so the safe default wins. `visibility: source` keeps every
setting as it was, and the client offers it as a switch.

### One transaction; files first, removed if anything fails

The plan is computed purely from the source (`planImport`: new ids generated up front, so
every reference is remapped before anything is written). Objects are copied first, eight at
a time; then, in **one transaction** under an advisory lock on the target page, every row is
inserted, _assignment published_ is claimed for anything now visible, and the audit event is
written. If a copy fails, the copies already made are deleted and the import answers `503
COURSE_IMPORT_COPY_FAILED` with nothing written; if the transaction fails, every copy is
deleted. A copy that cannot be deleted then is left to the orphan sweep (ADR 0032), which
removes any object no row names after a day. Both failure paths are tested.

### Synchronous, not a job

A large real course page holds a few dozen file materials and a handful of folders (at most
100 files each): a couple of hundred objects. A server-side copy moves no bytes through the
API and takes tens of milliseconds, so eight at a time is a few seconds at most; the rows
are a few hundred, inserted in batches of 500. That fits one request, and a request gives
the author the report straight away. A queued job with progress would be the next step if a
page ever measured too slow; nothing caps the size silently.

### Who may, and how it is found

- The caller must **author both pages** (teach the offering or administer offerings,
  `LearningAccessService`) in the same institution: `403 LEARNING_AUTHORING_DENIED`
  otherwise, `404` for a page of another institution, `400 COURSE_IMPORT_SAME_PAGE` for the
  page itself.
- `GET …/learning-spaces/:spaceId/import/sources` pages the pages they author (every page
  of the institution for an administrator), **other offerings of the same course first**,
  then the latest term first, filtered by page name, course code or title, or term.
- `GET …/import/preview?from=` answers **exactly the report** the import would give, with
  nothing written; `POST …/import` copies and answers it again with `imported: true`.
- The report: counts per kind, the date shift (days, both term starts), dates moved,
  references remapped, the visibility choice, and flags grouped by kind with a count and the
  first 20 titles.
- Audited as `learning_space.imported` on the target page, with the source, the counts, the
  shift and the visibility choice.

## Consequences

- A second import of the same page adds a second copy; nothing detects it.
- Quiz slot marks, review options and the gradebook column's weight come across as they
  were; a teacher who changed the grading scheme between years edits them after.
- Discussions are not copied — a course's discussion is posts, and posts are students'.
- The demo seed gives last year's Algorithms offering a full course page, bank and quiz, so
  the import can be walked from the current one.
