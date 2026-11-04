# UI Work Plan

Date: 2026-10-22. The delivery plan for every finding in `UI Design Audit.md` — the third
pass (C1–C11) and what the first two passes left open — merged with the open UX rows of
`Task Tracker.md` (B33, B34, B38, B40, B41, B45) so nothing is planned twice.

Each step below is **one session** in the `ship-backlog-step` sense: both halves where the
API is involved, tests, a browser check at 1440×900 and 390×844 in English and Slovak, docs,
commits on `dev`. Steps are ordered so that shared pieces land before the screens that use
them. Size: **S** under half a day, **M** about a day, **L** more than a day — split an L if
it runs long, never merge two steps.

When a step is done, tick it in the checklist at the bottom and record anything noticed but
not fixed under _Noticed_ — do not fix it in the same session.

## Resuming from a cleared context

Everything needed is on disk; nothing lives only in a conversation.

1. Read `STATUS.md` → _What to do next_. It names the current step.
2. Take the **first unticked step** in the checklist at the bottom of this file. Read its
   section here, then the audit sections it cites (`UI Design Audit.md`, _Third pass_, C1–C11
   — each finding there carries `file:line` evidence, re-check it before building, lines
   drift).
3. Ship it per `.claude/skills/ship-backlog-step/SKILL.md`, then tick it here, update
   `STATUS.md`'s next task to the following step, and close any absorbed tracker row in
   `Task Tracker.md`.
4. The _Product decisions_ table below is settled at its **Recommended** column unless the
   user has since said otherwise; do not re-ask those. B35 is the only open question.

How the audit was produced, in case a step needs a second opinion: seven read-only reviewer
agents (DeepSeek V4.1 Flash via the T3 `delegate_task` tool, `opencode` provider, variant
`high`), one per surface, each finding spot-checked against the source before it went into
the audit. Reviewers must be told **observe only** — one of them posted a test reply with a
long link and hid a discussion thread in the seed; `pnpm db:seed` restores it.

Environment on this machine, as of 2026-10-22:

- The API listens on **:3000**, not :3010 — `backend/.env` has `PORT=3000` and
  `frontend/.env.local` (which wins over `.env`) points the client at :3000. Health is
  `GET /health`, without the `/api` prefix.
- The frontend runs on :3001; Postgres, Redis, MinIO and Mailpit run in the `sv-dev-*`
  containers.
- Several agents driving the app at once trip the API's rate limit on `/me/permissions`
  (429). That is what exposed C3; when walking the app, run one browser at a time.

## Principles every step follows

These are the rules the audit kept finding broken. A step is not done if it breaks one.

1. **Nothing irreversible on one click.** Destructive → `ConfirmAction` naming the object and
   the consequence. Reversible → act, and offer _Undo_ on the toast.
2. **No identifiers in the interface.** Never ask for, or print, a UUID. Pick people with
   `PersonPicker`, things with a select of their names.
3. **A failure is not a refusal, and a refusal is not an outage.** Transport errors →
   `QueryError` with retry; 403 → one refusal state; 404 → not-found page.
4. **Every empty select explains itself** — what is missing, why it is needed, one link to
   create it.
5. **One word per concept, one verb per action.** _Add &lt;thing&gt;_ to create, _Save
   changes_ to edit, _Remove / Retire &lt;thing&gt;_ to destroy. Placeholders are examples
   (_e.g. FEI_); rules live in the field's description.
6. **State that a person would share lives in the URL** — search, filters, sort, tab, thread,
   week.
7. **Nothing filters a paginated response on the client.** Filter on the server, or load the
   whole list first.
8. **Every server message the user sees is translated**, chosen by `ApiError.code`, never the
   API's English sentence.
9. **Focus goes somewhere.** When a control swaps for a form, focus the form; on cancel or
   save, return focus to the control that started it.

## Phase N — Information architecture (taken first, 2026-10-22)

_Asked for by the product owner on 2026-10-22: "it is easy to get lost in all those pages
and tabs". Taken **before U1**, in the order below. The owner left the scope to us, with
one decision: **Exams stays its own menu entry.**_

What was wrong: _Catalogue_ held terms, programmes, courses and every offering; _Org units_
held rooms; inviting a person lived under _Roles_; a student had eight menu entries for
four jobs; on the course page assignments to hand in sat under _Materials_ and results
under _Assessment_.

### N1. The shell: five student entries, search and notifications in the header — **M**

- Header: a search trigger (⌘K / Ctrl K, opens `/search?q=`) and a notification bell with
  the unread count (`notificationQueries.unreadCount`), linking to `/notifications`.
  _Search_ and _Notifications_ leave the sidebar.
- Student menu: **Home** (the dashboard), **Courses** (tabs _My courses_ · _Find
  courses_, the latter what `/enroll` was), **Calendar**, **Exams**, **Grades**.
- Teacher: Home, **Teaching**, Calendar (+ student entries if they also study).
- Phone tab bar: exactly the person's first five entries; _More_ only when there are more.
- `/enroll` redirects to `/courses?tab=find`; every link to it updated.

### N2. Course page tabs named for what you do there — **M**

- Overview · Materials · **Assignments** · Schedule · **Grades** · Discussion · People
  (teachers only). Assignments leave _Materials_; _Assessment_ becomes _Grades_.
- Overview leads with what is next: the next class, the next deadline, the latest post.
- `?section=materials#activity-…` links (U0) move to `section=assignments`; old
  `section=work` maps to `grades`.

### N3. Administration in four hubs — **L**

| Hub            | Tabs (`?tab=`)                              | Was                                        |
| -------------- | ------------------------------------------- | ------------------------------------------ |
| Structure      | Org units · Rooms · Terms                   | `/org-units` (+ rooms), terms on Catalogue |
| Teaching offer | Programmes · Courses · Offerings · Learning | `/catalogue`, `/learning`                  |
| People         | Directory · Invitations · Roles             | `/people`, `/roles`                        |
| Institution    | Settings · Bulk entry · Audit trail         | `/settings`, `/bulk`, `/audit`             |

Each tab is gated like the page it replaces; a hub with no visible tab is not offered.
Old routes redirect to `hub?tab=`. The setup checklist (U11) later walks the hubs in order.

### N4. Breadcrumbs — **S**

_Takes U24's breadcrumb half._ A `Breadcrumb` slot on `PageHeader`; _Teaching offer /
Courses / Algoritmy_ on a course page reached from administration, _Courses / Algoritmy_
otherwise; _Teaching offer / Programmes / &lt;name&gt;_ on a programme.

## Phase 0 — In flight

### U0. Links land on the thing, and opening a notification reads it — **M**

_This is tracker **B33**, already STATUS's next task; absorbs C8's notification items._

- Notification, calendar-deadline and exam-card links carry `?section=` (materials for
  assignment types, schedule for exam terms, work for results) and the item's anchor;
  the payload already has `learningActivityId` and `examTermId`.
- The whole notification card is the link, with a visible affordance; following it marks
  the notification read (`markRead` exists).

**Done when:** every notification type opens on its tab with the item in view, and the
unread count drops on open. Unit test for the href builder per type.

## Phase 1 — Trust foundations

Small, shared, and they make every later step cheaper.

### U1. `ConfirmAction` and every destructive action behind it — **M**

_Closes C1 and tracker **B41**._

- `shared/ui/confirm-action.tsx`: an `AlertDialog` (or inline disclosure on mobile) with a
  title naming the object, one sentence of consequence, a destructive confirm button
  labelled with the verb, focus returned to the trigger. Optional count in the copy
  ("34 students are registered").
- Apply to: retire org unit, room, offering, academic term; unassign teacher; remove exam
  term, assignment, material; publish grade; erase person; withdraw from a course; cancel
  an exam registration; leave a waiting list; sign out a session and all other sessions;
  replace the calendar link; turn off two-step verification.
- Student-side reversible actions (register for an exam while seats remain) get _Undo_ on
  the success toast instead.
- Org-unit tree: Retire hidden on a unit with children (known client-side); when the server
  answers `ORG_UNIT_IN_USE`, the dialog says what still belongs to it.

**Done when:** a grep for `variant="ghost"` + `.mutate(` on remove/retire/withdraw paths finds
none without a confirm; tests for the component and two call sites.

### U2. Failure states: permissions, refusals, route loading — **M**

_Closes C3, tracker **B40**, and the open `loading.tsx` item._

- `usePermissions` returns `isError` and `refetch`. Frame, dashboard and every gated view
  render `QueryError` on error, never the denial copy.
- One `Refusal` state for 403, used by `/people`, `/org-units`, `/roles`, `/audit`, `/bulk`.
- `app/institutions/[institutionId]/loading.tsx` (shell + `TableSkeleton`) and
  `courses/[offeringId]/loading.tsx`; a segment `error.tsx` for the institution layout so
  the sidebar survives a failing page.
- Sidebar skeleton shaped like the nav (heading + rows); the mobile nav trigger stays
  enabled while permissions load.
- Calendar-subscription card gets its missing error branch; issue/replace shown only on
  success.

**Done when:** stubbing `/me/permissions` to 500 and 429 shows a retry, never "not
permitted"; stubbing 403 shows the refusal.

### U3. Primitive and token fixes — **S**

_Closes the shared items of C5, C9, C11._

- `Select` wrapper `w-full` (call sites narrow it where they want).
- `requiredFieldNames` ignores `z.boolean()` — no asterisk on switches.
- `Close` in `sheet.tsx` and `dialog.tsx` from `common.close`.
- `break-words` on discussion post bodies; nested `<h2>` in `offering-discussion.tsx` (done 2026-10-22, frontend `c1b8dd6`);
  `type-heading` → `type-section`.
- One `formatInstant` (hour + minute, institution zone) replacing the three time formats;
  exam registration close shows the time.
- One `formatBytes` (kB/MB via `Intl` unit) for attachment and upload sizes.

**Done when:** `pnpm verify` green; the timetable form's three selects fill their columns.

### U4. Translated errors and validation — **M**

_Closes the message items of C5 and C9; the `ThrottlerException` line in the tracker._

- `toApiError` gains `messageFor(error, namespace)` that picks a catalogue key by
  `ApiError.code`, with a generic fallback; replace every `toast.error(toApiError(e).message)`.
- Keys for the codes users actually meet: not found after a hide, hidden thread, in use,
  has children, conflict, rate limited, file type, infected, too large.
- Schema builders take a `messages` object (the `create-user` pattern) in timetable,
  academic terms, exam terms, assignments, rooms, study groups, programme members.

**Done when:** the Slovak session never shows an English sentence or an id after a failure;
i18n gate green.

## Phase 2 — No identifiers, and a home for people

### U5. Granting roles and creating an institution without UUIDs — **M**

_Closes C2 and the `/roles` half of tracker **B34**._

- `grant-role-form`: `PersonPicker` for the person; scope becomes a select fed by org units,
  programmes or offerings according to scope type; **no preselected role**; scope defaults
  to the narrowest the role allows.
- `invite-person-form`: same role rule, one line describing each role; the invitation link
  rendered as a copyable field, not prose.
- Role assignment table resolves names via `listPeople({ userIds })`, scope shown by name.
- `create-institution-form`: first administrator by **email** (`firstAdminEmail`, already
  accepted by the API), not account id.
- Delete or wire the unused `CreateUserForm`.

**Done when:** no form or table under `/roles` or `/institutions/new` shows or accepts a UUID.

### U6. The people directory — **M**

_Closes C6 (people, P1) and C7 (directory); the "derived Teacher badge" line in the tracker._

- `ListToolbar` (built here, reused in Phase 4): debounced `type=search` bound to `?q=`,
  filter chips, _Clear all_; state in the URL via `router.replace`.
- Directory: server-side `q`; role and status chips (add `role`, `status` to
  `ListPeopleQueryDto`); search resets the page cursor.
- Role badges deduplicated, with a count and the scope in a tooltip ("Teacher · 16 courses").
- Status badge only when not `active`.
- Row actions in a menu (Erase moves there); invite form on `/people` behind _Add person_.
- Global search's person hit links to `/people?q=<name>`.

**Done when:** finding a person among 178 takes typing, not scrolling; a search URL can be
shared.

### U7. A page for a person — **L**

_Tracker **B34**, unchanged in scope:_ enrolments, roles, study progress; every place that
names a person (roster, directory, programme students, grade entry, submissions, audit
trail) links to it. Builds on U5 and U6.

## Phase 3 — Guided setup

The product owner's ask: a non-technical first-time administrator is led step by step.

### U8. Form conventions across every manage-* form — **L**

_Closes the convention items of C5; split into U8a/U8b if it runs past a day._

- **`FormDisclosure`**: each form collapses to an _Add &lt;thing&gt;_ button that expands
  inline (sheet on mobile); open by default only while its list is empty.
- **After submit:** keep what repeats between entries, clear what doesn't, focus the first
  field that changes, ring the new row for a few seconds, toast with _Show_ that scrolls to it.
- **One layout rule:** a labelled two-column grid, the submit on its own row; delete the
  `flex-wrap` + `mt-6` forms.
- **Copy rule** applied to `en.json` and `sk.json`: _Add &lt;thing&gt;_ everywhere (14 verbs →
  1), _Places_ for every capacity, _Type_ for a kind of thing and _Status_ for a lifecycle,
  _Belongs to_ for a parent, placeholders prefixed _e.g._, rules moved into descriptions.

### U9. Form-specific fixes — **M**

_Closes the per-form items of C5._

- Catalogue entry form: a schema, visible errors on blank fields.
- Offering form: a _Language_ field; a description per status; default status from the
  term's enrolment window; the course select searchable.
- Academic term: one description over the enrolment-window pair; warn when saving with no
  window ("students will not be able to enrol themselves").
- Exam term: order day → time → attempt → seats → window → room → examiner; one hint per
  field; _No limit_ as a description, not a placeholder.
- Assignment: help text for Opens / Due / Closes; Closes derived from Due by default.
- Org unit: parent options labelled with their parent ("Department of Physics — FEI");
  parent default follows the type (a faculty defaults under the university).
- Institution settings: time zone as a searchable select of IANA zones with the local time
  shown; errors mapped to the field the API names; terminology fields show the platform
  default as placeholder plus one worked example.

### U10. The prerequisite pattern, and the setup routes — **M**

_Closes C4.2 and the routing items of C4._

- `shared/ui/prerequisite.tsx`: replaces an empty select, keeps the label; _what is missing_,
  _why_, one link with `?add=<kind>`; disables submit while shown.
- `?add=<kind>` opens and focuses the matching `FormDisclosure` on arrival.
- Apply at: offering form (course, term), timetable (room), exam term (room, examiner),
  assign teacher and admit student (people), study-group membership.
- Rooms get a nav entry and their own route; the offering guard's two nouns become links.

### U11. The setup checklist — **M**

_Closes C4.1, and the dashboard items of C11._

- An _Set up your institution_ card first on the administration dashboard: org units →
  terms (with an enrolment window) → rooms → programmes and courses → offerings → people →
  roles → programme membership → teaching → timetable → exam terms → enrolment open. Each
  row ticked by an existing query (listed in the audit's C4 table), unticked rows link with
  `?add=`; _n of 12 done_; dismissible, and gone once complete.
- The administration section gets back _This week_ and _Deadlines_; one section order shared
  by sidebar and dashboard; an empty audit card links to where events come from.

**Done when:** a throwaway institution can be taken from empty to a student enrolling by
following the card alone — walk it in the browser and record the walk.

### U12. The timetable form, redesigned — **M**

_Closes C5's timetable redesign; the reference guided form for everything after it._

- The form receives the offering's `term` and `groups`.
- Questions in order: who is it for → what kind → weekday, from, to → first class on
  (bounded by the term, defaulting to the first matching weekday) → repeats (_Every week —
  until 20 Dec 2026, 9 classes_ / _Just once_) → room → optional title.
- A live summary sentence above the button; the button says _Add 9 classes_.
- After submit: keep who/kind/room/times, move the date on, focus it, ring the new slot.
- A 409 lands on room + time and names the clashing course.

### U13. The org-unit tree — **S**

_Closes C7 (tree)._

- Name, code and type badge in one block, actions in an aligned right column (row menu on
  mobile); tighter rows.
- _Edit_ (rename, change parent — `PATCH` exists) so "move those first" has somewhere to go.

## Phase 4 — Findability

All on U6's `ListToolbar`. Sorting: expose `sortBy`/`order` from `PaginationQueryDto` on each
endpoint the step touches, and render sortable headers with `aria-sort`.

### U14. Enrollable courses — **M**

Default `termId` to the term whose window is open; newest term first; add `q` to the
endpoint; search over code and title; keep _actionable only_. The "place came free"
notification links with `?q=` to the course.

### U15. Course offerings and catalogue — **M**

Endpoint filters `termId`, `q`, `full`, `noTeacher` and sort by code; the offerings table
gets a term select (default current), search and the two chips; catalogue courses get search
and a programme filter.

### U16. Audit trail — **S**

`LoadMore` where the "more exist" sentence is; actor (`PersonPicker`) and subject-type filters
the DTO already accepts; all in the URL. (Tracker B42 — what the trail records — stays
separate.)

### U17. The shorter lists — **M**

Programme members: name search, standing filter. Roster and offering grades: sort by surname,
_not graded_ filter (client-side is fine — they are not paginated). Notifications: _Unread_
filter, defaulting on when any exist; say when the list is cut at 100. Calendar and my exams:
filters and week into the URL. Bulk-entry result: failed/skipped filter.

## Phase 5 — Students on a phone

### U18. Say why, instead of a dead button — **S**

Closed, full or not-yet-open exams and offerings show the reason in place of the button
(_Registration closed 4 Nov 09:00_, _Full — join the waiting list_); the affirmative label only
when the action is available.

### U19. The calendar on a phone — **M**

_Mostly done 2026-10-22 (frontend: week grid commit): a Week | List switch in `?view=`,
phones default to the list and wide screens to the grid. Still open here: previous/next as
icon buttons, filters behind a disclosure on phones, and the week boundary in the
institution's zone._

Agenda (day list) below `md`, week grid above, with a toggle; previous/next as icon buttons
flanking the week label; filters behind a _Filters_ disclosure with fluid widths; the week
boundary computed in the institution's zone.

### U20. Handing in, and reading your results — **M**

_Overlaps tracker **B38** — ship together if B38 is taken first._

- Submission: selected files as name + size rows with remove; accepted types and size limit
  stated above the control; the input reset after a successful hand-in; upload progress.
- Assessment table: stacked cards below `sm`, `scroll-affordance-x` above.
- Student empty states (courses, grades, exams, enrol) through `EmptyState` with the action
  that resolves them (_Browse courses_, _Clear filters_).

## Phase 6 — Discussion and account

### U21. Course discussion — **M**

_Closes C9 (what U3 and U4 did not)._

- `?thread=` uses `router.push`, so Back returns to the thread list.
- Focus: Edit, Rename and New thread focus their field; cancel/save return focus.
- Attachments: upload progress (`onProgress` exists); the server's reason on failure (via U4);
  poll the thread while any attachment is `pending`; edit mode lists existing attachments
  with remove.
- Per-post actions named for their post ("Hide Petra's reply").
- Timestamps carry the year outside the current year; relative under a day.

### U22. Account settings — **M**

_Closes C10._

- Sessions: a unique label per row (browser, OS, last active, and IP **once the API sees the
  client's address** — STATUS records that every session currently carries the BFF's IP, so
  that forwarding fix is a prerequisite for showing it); `CriOS`/`FxiOS`/`EdgiOS` detected.
- Two-step: copy button on the manual key; focus moved on every mode change with a live
  announcement; recovery codes gated by an _I have saved these_ checkbox; download toasts and
  revokes its URL on a timeout.
- Section navigation (anchor list with `scroll-margin-top`, or tabs via `?section=`).
- Per-row pending state on notification-mail toggles; personal-data export not cached.
- Dirty guard on the profile form (shared with U24's save bar).

## Phase 7 — Navigation and chrome

### U23. The sidebar — **M**

_Closes C11's nav items; re-check tracker **B45** against the new mobile sheet and close it._

- Institution name at the top of the sidebar, with a switcher listing the person's other
  institutions.
- Collapsible, persisted, with an icon rail from `md` up.
- Programme pages select _Catalogue_ (a route → nav-key map for detail pages).
- Group labels as headings; the general group labelled.
- A search trigger in the header (⌘K) opening search with `?q=`.
- On phones, fold the section bar into the header row so the chrome is one bar.

### U24. Breadcrumbs and the sticky save bar — **M**

_Closes the last two items still open from the first pass._

- `Breadcrumb` primitive and a slot on `PageHeader`; _Institution / Catalogue / &lt;course&gt;_
  on the offering page, _Institution / Catalogue / &lt;programme&gt;_ on the programme page.
- `StickySaveBar` inside long forms (institution settings, profile): Save, _Unsaved changes_,
  live save result, `beforeunload` guard while dirty.

## Product decisions needed before the step that depends on them

Each has a recommended default; use it unless told otherwise.

| Before | Question                                                                                                           | Recommended                                               |
| ------ | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| U5     | First administrator of a new institution: email invitation only, or also pick an existing account?                 | Email only — the API already sends the invitation.        |
| U8     | Forms behind _Add_: inline expand or a side sheet on desktop?                                                      | Inline on desktop, sheet on phones.                       |
| U11    | May the setup checklist be dismissed before it is complete?                                                        | Yes, and restorable from the dashboard's menu.            |
| U19    | Default calendar view on a phone: agenda or day?                                                                   | Agenda.                                                   |
| U22    | Account settings: one page with anchors, or tabs?                                                                  | Tabs via `?section=`, the pattern the offering page uses. |
| —      | Tracker **B35** (what a registrar may do) still needs its answer; U14–U15 assume the registrar can read offerings. | Ask, as the tracker says.                                 |

## Order and checklist

Phases are ordered; inside a phase, the listed order. U0 first because it is already next.

- [x] N1 Shell: five student entries, search and bell in the header — M · 2026-10-22
- [x] N2 Course page tabs — M · 2026-10-22
- [x] N3 Administration hubs — L · 2026-10-22
- [x] N4 Breadcrumbs — S · 2026-10-22
- [x] U0 Notification and card links land on the thing (B33) — M · 2026-10-22
- [ ] U1 `ConfirmAction` everywhere (B41) — M
- [ ] U2 Failure, refusal and loading states (B40) — M
- [ ] U3 Primitive and token fixes — S
- [ ] U4 Translated errors and validation — M
- [ ] U5 Roles and institution creation without UUIDs — M
- [ ] U6 People directory and `ListToolbar` — M
- [ ] U7 Person page (B34) — L
- [ ] U8 Form conventions — L
- [ ] U9 Form-specific fixes — M
- [ ] U10 Prerequisite pattern and setup routes — M
- [ ] U11 Setup checklist — M
- [ ] U12 Timetable form redesign — M
- [ ] U13 Org-unit tree — S
- [ ] U14 Enrollable courses — M
- [ ] U15 Offerings and catalogue — M
- [ ] U16 Audit trail — S
- [ ] U17 Shorter lists — M
- [ ] U18 Reasons instead of dead buttons — S
- [ ] U19 Calendar on a phone — M
- [ ] U20 Hand-in and results (B38) — M
- [ ] U21 Course discussion — M
- [ ] U22 Account settings — M
- [ ] U23 Sidebar — M
- [ ] U24 Breadcrumbs and sticky save bar — M

Roughly 25 sessions: 4 small, 19 medium, 2 large. Phases 1–3 (U1–U13) are the ones that
change how the product feels to a newcomer; if time is short, stop after U13.

## Noticed

_Record here what a step noticed but did not fix._

- **U0 (2026-10-22).** A timetable change opens the calendar, not the course: a student's
  _Schedule_ tab lists only exams. The calendar opens on the current week, so a class moved
  to another week is a click away — U17 puts the week in the URL and can link to it.
- **U0.** A read notification card has a band of empty space under it at phone width — the
  `Card`'s own `py-6` and `gap-6` around a `CardContent` that pads again.
- **U0.** The bundle measured **594.51 kB against the 595 kB guard** after U0 (+0.8 kB).
  The next step that adds client code has to make room first.
- **2026-10-22, off-plan pass.** The catalogue's _Course offerings_ table is shown to anyone
  with `offering:read`, which students hold, and every row links to a course page that
  refuses them. Search no longer offers those (backend `721d005`); the table still does.
  U15 should show it to administrators only, or link a student's rows to `/enroll`.
- **N3/N4 (2026-10-22).** An administrator on a course page has no sidebar entry marked
  current — `/courses/:id` is not under any hub. And the course overview shows an
  administrator a _My enrolment_ card saying they are not enrolled, which is noise for them.
- **2026-10-22.** The client JS budget measures **603.92 of 605 kB** after the week grid.
  The next step that adds client code has to make room first.
