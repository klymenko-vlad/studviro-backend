# Course Builder Plan

Date: 2026-10-22. Asked for by the user: make a course something a teacher _builds_, step
by step, the way they would in Moodle — an outline of sections, things in it that appear
when they should, work that unlocks in order, and tests and quizzes.

Each step below is **one session** in the `ship-backlog-step` sense: both halves, tests, a
browser check at 1440×900 and 390×844, docs, commits on `dev`. Size: **S** under half a day,
**M** about a day, **L** more than a day — split an L if it runs long, never merge two steps.
Tick a step in the checklist at the bottom when it ships, and record what was noticed but not
fixed under _Noticed_.

## Where courses stand

What a course page had on 2026-10-22, before CB1:

| Moodle                                    | StudViro before this plan                                  |
| ----------------------------------------- | ---------------------------------------------------------- |
| Course page is an outline of sections     | One flat list of materials; assignments on another tab     |
| Resources: file, URL, page, label, folder | `file`, `link`, `text`                                     |
| Activities: assignment, quiz, forum, …    | Assignment only; one discussion per course (ADR 0040)      |
| Hide / show any item or section           | Hide / show a material or an assignment; publish the space |
| Available from / until a date             | An assignment's `opensAt`; nothing for a material          |
| Activity completion and a progress bar    | `activity_completions` table, never written                |
| Restrict access: unlock after X           | Nothing                                                    |
| Group-restricted content                  | Study groups exist; nothing is restricted to one           |
| Import content from last year's course    | Nothing — every offering starts empty                      |
| Quiz engine                               | **Ruled out by ADR 0028 (L7)**                             |

**Quizzes are back in scope.** ADR 0028 ruled them out because nothing asked for them; the
user has now asked, on 2026-10-22. That ADR's argument about size still stands and is why
quizzes are three steps here, not one. CB6 writes the ADR that supersedes L7.

## Principles every step follows

1. **Hidden means hidden on every read.** An item a student may not see is absent from the
   outline, from `/me/deadlines`, from the calendar, from search, and answers 404 by id. A
   new visibility rule is enforced in one place and tested on each read path.
2. **The server decides availability**, from its own clock — as it decides lateness
   (ADR 0028). The client renders the answer; it never computes whether something is open.
3. **A teacher sees what is hidden, and why.** Every hidden, scheduled or locked item carries
   its reason as a badge for the author, and as a plain sentence for the student where the
   student may know it exists ("Opens on 3 November", "Complete _Week 1 quiz_ first").
4. **Nothing is lost by restructuring.** Removing a section keeps its contents; moving an
   item never resets its submissions or marks.
5. **The bundle is at its ceiling** (`.size-limit.mjs`). Every client step records what it
   cost there. No new dependency for drag and drop — ordering is by move buttons, which are
   also the accessible way to do it.

## Steps

### CB1 — Sections and one course outline · M · **Done 2026-10-22**

A course page is an ordered list of **sections** (Moodle's topics or weeks), each with a
title, a summary and its own hide switch. Materials and assignments are placed in a section
and ordered together inside it, so a teacher can lay out "read this, then hand in that".
Anything not in a section sits in the untitled general area at the top.

- `learning_sections`; `section_id` on `learning_materials` and `learning_activities`.
  Positions are shared by both tables within a section. **ADR 0043.**
- A hidden section hides everything in it, on every read: outline, by-id, download,
  submissions, deadlines.
- Removing a section moves its contents to the general area.
- The _Materials_ tab becomes _Content_, the outline; assignments appear in it, linked to
  their place on the _Assignments_ tab.

### CB2 — Available from, available until · S · **Done 2026-10-23**

`availableFrom` / `availableUntil` on a section, a material and an assignment. Before the
window a student sees the title and "Opens on …" (or nothing, if the author chooses _hide
until then_); after it, nothing. Assignments keep `opensAt` for _submission_; availability is
about _seeing_. Fold in the notification gap noted under CB1: "assignment published" must
fire when the student can first see it, including when its section is shown.

Shipped as **ADR 0044**: the server answers `availability` (`scheduled` / `open` / `ended`)
with the dates; a not-yet-open item is title-only and 404 by id; a section's window covers
its contents; deadlines and the calendar show an assignment once it is open. _Assignment
published_ is claimed once through `announced_at`, straight away on the change that shows
it and by a one-minute sweep when a date passes.

### CB3 — Completion and progress · M · **Done 2026-10-23**

Write `activity_completions`, which has existed since the canonical schema and was never
written. Per item, the author chooses a completion rule: none, _student marks it done_,
_viewed_ (a material opened or downloaded), _submitted_, _marked_ / _passed with ≥ N_. The
student gets a tick on each item and a progress bar per course and per section; the teacher
gets a completion table (students × items). Materials need a completion row of their own —
decide in the ADR whether that is a second table or a nullable `learning_material_id`.

Shipped as **ADR 0045**: one table with a nullable `learning_material_id` beside
`learning_activity_id` (exactly one set). The row keeps the facts (`viewed_at`,
`marked_done_at`) and the state the server derives from the rule, recomputed on a hand-in,
a mark or its correction, a view, a tick, and for every student when a rule, pass mark or
maximum changes. Materials take _none / tick / opened_, assignments _none / tick /
handed in / marked / passed with ≥ N points_. Progress counts tracked items the student can
open now; the teacher's table is a _Progress_ tab, a page of students at a time.
`CompletionService.isComplete` / `completedItems` are CB4's entry points.

### CB4 — Step by step: restrict access · M · **Done 2026-10-23**

An item or a section is **locked until** a condition holds: another item complete (CB3), a
mark at or above a threshold, a date (CB2), or membership of a study group. Conditions
combine with _all_ / _any_. A locked item shows the student what unlocks it; a condition the
student must not know about can hide the item outright instead. Evaluated on the server on
every read path from principle 1, with one `AvailabilityService` the other services call.

Shipped as **ADR 0046**: a `restriction` (jsonb) on sections, materials and assignments —
_complete_, _mark ≥ N_, _date_, _study group_, under all/any with one level of grouping,
and one _hide while locked_ switch per restriction. A locked student gets the title and the
unmet conditions, 404 on every content path, and nothing on deadlines or the calendar;
locked items do not count towards progress. Cycles and foreign targets are refused when
saved; a removed target fails closed and is flagged `missing`. _Assignment published_ goes
only to the students a restricted assignment is open to, once one can open it; students who
unlock it later are not told (future work in the ADR). The demo seed locks _Weeks 5–8_
behind Assignment 1 and _Extension exercises_ behind 90 points in it.

### CB5 — More things to put on a page · M · **Done 2026-10-24**

New material kinds: **page** (a long body with headings and lists, sanitised Markdown —
no editor dependency), **label** (a line of text between items, no page of its own),
**video** (an embedded YouTube or Vimeo URL, allow-listed in the CSP) and **folder** (several
files under one title). Each kind gets its own form section and its own row in the outline.

Shipped as **ADR 0049**: four new `learning_material_kind` values, so every rule from CB1–CB11
holds for them unchanged. A page is Markdown up to 100 000 characters, left out of the list
and read whole by id on a route of its own, rendered by a dependency-free Server Component
that builds elements rather than HTML; the form previews it through a Server Action. A label
is titled by its own text and can only be untracked. A video is normalised on the server to
the YouTube no-cookie or Vimeo do-not-track embed, and only those two origins may be framed.
A folder holds up to 100 files in `learning_material_files`, paged and filtered, uploaded,
scanned, downloaded and reclaimed like a file material's; erasure keeps them as course
content. Every material can now be retitled and rewritten. The demo seed puts a study guide,
a label, a lecture recording and a folder of two handouts on every course page.

### CB6 — Quiz authoring and the question bank · L · **Done 2026-10-24**

A new ADR (0044 went to CB2) supersedes ADR 0028's L7. A course has a **question bank** organised in
categories; a question is versioned on edit so past attempts keep the text they were asked.
Question types: **single choice, multiple choice, true/false, short answer, numerical,
matching and essay**. A **quiz** is a new `learning_activities.type` placed in the outline
like an assignment: window, time limit, attempt limit, grading method (highest, last,
average), questions picked by hand or at random from a category, shuffle on or off, its own
gradebook column. Authoring only — no attempts yet.

Shipped as **ADR 0050**: one bank per course page (offering), not per catalogue course — a
quiz takes a question's latest version when an attempt starts, so a bank shared across terms
would let next year's edits change this year's running quiz; CB10 copies the bank instead.
Flat categories, unique by name, removable only when empty and not drawn from. Questions are
an identity (`questions`, type fixed) and immutable `question_versions` (text, default mark,
feedback, answer key as `jsonb`), a new version on every edit that changes them. Seven types,
each key validated by one pure function. A quiz is a `learning_activities` row of type `quiz`
with a `quizzes` settings row and an `assessment` worth 10 points by default (question marks
are scaled to it, as Moodle's maximum grade); its close is stored in `due_at`, so deadlines,
the calendar and announcements read it unchanged. Its questions are `quiz_slots`: one
question by hand with a mark, or N at random from a category with a mark each, mixed freely,
paged and filtered. `quiz` is now an item kind for completion, restrictions (a _mark_ condition
takes `itemKind: quiz`), the sight report and group content; the student view lists quizzes.
The bank and the quiz editor are routes of their own; adding a quiz on the course page takes
a name and makes it hidden. The demo seed gives Algorithms a bank of one question of each type
in three categories and a _Foundations quiz_ in _Weeks 1–4_. The CB7/CB8 tables are sketched
in the ADR.

### CB7 — Taking a quiz · L

The attempt lives on the server: started, answers saved as they are given, survives a
closed laptop, closed by submission, by the time limit or by the quiz window — whichever is
first, on the server's clock. Auto-graded on submission with partial credit for multiple
choice; the mark lands in the quiz's assessment, as marking does for an assignment. One
question per page or all on one, keyboard-operable, WCAG 2.2 AA.

### CB8 — Quiz review and marking · M

Review options per quiz — what a student sees after an attempt and when (immediately,
after the quiz closes, never): their answers, right/wrong, the correct answer, feedback.
Teachers mark essay questions and override any automatic mark; changing an answer key
offers a regrade. A per-question results view (how many got each question right).

### CB9 — Content for one group · S · **Done 2026-10-23**

Restrict a section or an item to one or more study groups (they exist, from the registry).
Lands on the CB4 condition engine as a condition type; this step is its interface and the
roster-side view of "who can see this".

Shipped as **ADR 0047**: the _Groups_ control writes an `audience` (groups, and whether
others see nothing or the lock) beside the conditions in the same `restriction`, ANDed with
them and checked first; each control keeps the other's half. Authors see a _Group S1, S2_
badge, a _Who can see_ table per section and item (every enrolled student, can open / title
/ nothing and why, batched, paged and filtered), and on the People tab what each group's
content is, linked to its place in the outline. A removed group fails closed and is flagged.
The demo seed gives each seminar group a worksheet: S1's hidden from S2, S2's shown locked.

### CB10 — Reuse last year's course · M

Copy the outline of another offering the teacher authors — sections, materials (files
copied in the store, not shared), assignments, quizzes and their questions — into this one,
with every date shifted by the gap between the two terms. Nothing student-owned is copied.
Moodle's _import_; the thing that makes the second year cheap.

### CB11 — View as a student · S · **Done 2026-10-23**

A switch on the course page that renders the outline as an enrolled student would see it
today: hidden, scheduled and locked items as the student sees them. Read-only, no
impersonation — the server answers the student view for the author on request.

Shipped as **ADR 0048**: `GET …/student-view` answers sections, materials, assignments and
progress through the very methods the student's own reads call, for one enrolled student
(`?asStudent=`) or for a student with no progress and no group; authors only, 404 for
someone not enrolled. A _View as a student_ switch on the Content tab opens a paged,
filtered picker; the outline then renders read-only under a _Viewing as …_ banner with
_Back to editing_.

## Checklist

- [x] CB1 — Sections and one course outline
- [x] CB2 — Available from, available until
- [x] CB3 — Completion and progress
- [x] CB4 — Step by step: restrict access
- [x] CB5 — More things to put on a page
- [x] CB6 — Quiz authoring and the question bank
- [ ] CB7 — Taking a quiz
- [ ] CB8 — Quiz review and marking
- [x] CB9 — Content for one group
- [ ] CB10 — Reuse last year's course
- [x] CB11 — View as a student

## Noticed

- ~~An assignment in a hidden section still raises _assignment published_ when the assignment
  itself is shown, and nothing is raised when the section is later shown.~~ Fixed in CB2.
- Search indexes no materials or assignments. When it does, it must apply `sightOf` (CB2).
- A section that has not opened yet shows its title and "Opens on …" with a little empty
  space under it on the student's page; a tighter card when it has no contents would read better.
- ~~Materials have no edit form, only _Availability_, _Hide_ and _Remove_; renaming a material
  means removing and re-adding it.~~ Fixed in CB5: an _Edit_ action for the title and content.
- The demo seed's dates sit at midnight UTC, so the demo shows deadlines and openings at
  01:00 or 02:00 local time.
- ~~`learning-materials.service.ts` is past 300 lines after CB3; split it before CB5 adds more
  kinds.~~ Split in CB5: `MaterialOpeningService` and `LearningMaterialsRepository`.
- The `ilike` escape is written out four times now (`people.repository.ts`,
  `search.service.ts`, `course-students.repository.ts`, `folder-files.repository.ts`); one
  shared helper would do.
- The Assignments tab does not show a student their completion state; only the outline does.
- On a phone, the completion table clips long item titles to three lines in its header.
- `feat/course-sections` (frontend) is behind `dev`: regenerating the client in CB3 brought in
  the teacher search kind from backend `c281c6b`. CB3 handles it minimally (a teacher hit goes
  to People, a _Teachers_ label); when the branch merges, keep `dev`'s teacher profile route
  (`cda3724`) instead.
- ~~An empty `PATCH` of a material (no fields) answers 500.~~ Fixed in CB5, with a regression
  test.
- A restriction can wait for an item whose completion rule is later set to _none_; it then
  can never be met and nothing warns the author. Likewise a mark threshold above a later
  lowered maximum.
- Students who unlock a restricted assignment after it was announced get no notification
  (ADR 0046); per-student announcements need their own table.
- The restriction editor sits on the Content tab only; the Assignments tab shows the badge
  but has no _Access_ button.
- CB9 was taken before CB5–CB8, out of order, at the coordinator's request.
- The group picker in the _Groups_ control and the People tab's groups card read the whole
  `listStudyGroups` response; the study-group list is not paged or filtered (pre-existing).
- A teacher (not an administrator) sees a group's content on the People tab but cannot
  manage groups; `offering:manage` still gates opening and filling groups.
- On a phone the _Who can see_ table scrolls sideways, like the completion table.
- Each outline row now carries _Access_, _Groups_ and _Who can see_ beside the other
  actions; a row's actions are crowded on a phone and would read better behind one menu.
- CB11 was taken before CB5–CB8 and CB10, at the coordinator's request.
- The Assignments tab has no student view; only the Content outline does (ADR 0048).
- In the student view, _Your progress_ keeps the student's own wording; "Their progress"
  would read better to the author but needs the meter to take its label from outside.
- The student view of an unpublished page shows it as it will be once published, with no
  note saying a student cannot reach it yet.
- A folder is created empty and its files are added one by one after it, so a failed upload
  in the add form leaves the folder with the files that did arrive (the author is told).
- A video with the rule _opened_ completes when the student sees its row, not when they play
  it; the player is cross-origin (ADR 0049).
- The page route has a _Back to the course_ link but no breadcrumb trail like the course page.
- While a page's preview is shown, the _Page text_ label points at no control; a role="tab"
  pair (Write / Preview) would read better than one toggle.
- Markdown on a page has no tables, images or nested lists; images would need an upload of
  their own and a wider `img-src`.
- Folder files cannot be renamed or moved between folders, and there is no download of a
  whole folder.
- The demo seed writes 144 small objects to the store on every run; the previous run's objects
  are left for the orphan sweep, since their rows go with the institution.
- The student's Content tab opens with the _Course page_ card ("The page students see for this
  course…"), which is written for the author.
- _Deadline published_ and _deadline moved_ fire for a quiz too, and the inbox still calls
  them an "assignment deadline"; their notification links open the Assignments tab, which
  does not list quizzes (the calendar links to the quiz's row).
- The Assignments tab and the Up next card do not show quizzes; only the outline, deadlines
  and the calendar do.
- Removing a quiz or a question has no confirmation, like every other removal (U1).
- A random draw is checked against its category's size only when it is saved; questions
  removed or moved out later can leave it short (CB7 must decide what an attempt does).
- The `ilike` escape now has a shared helper (`contains-pattern.ts`, used by the bank); the
  four older copies listed above have not moved to it.
- The question list shows each question's latest version only; the versions endpoint has no
  screen yet.
- A quiz's completion rule is set only on its settings page, not with the select materials
  have in the outline.
- Two client-heavy routes cost about 16 kB of bundle each; CB7's attempt screen will cost
  more, so its budget should be planned, not discovered.
