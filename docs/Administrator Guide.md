# Administrator Guide

How to set up an institution in StudViro from nothing, and how to run it afterwards.

StudViro is the system of record: there is no upstream system to import from, and nothing
arrives by itself. Everything below is something a person enters (ADR 0024).

This guide is written in the order the screens require. Each step depends on the one
before it — you cannot put a course on offer before there is a term for it to run in, and
you cannot make somebody a student before there is a programme to admit them to.

Every task names the **permission** it needs and the **screen** it is on. If a tab is
missing from your navigation bar, it is because you do not hold the permission behind it,
or because the institution has that feature switched off.

## Before you start

| Thing              | What is needed                                                                                                   | State               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------- |
| Institution code   | A short lowercase identifier — letters, digits and hyphens. It cannot be changed later.                          | `TODO(institution)` |
| Time zone          | An IANA name such as `Europe/Bratislava`. Every time in the product renders in it.                               | `TODO(institution)` |
| Default language   | English or Slovak. Slovak translation is incomplete; some strings still render in English.                       | `TODO(institution)` |
| Org structure      | Which faculties, departments and institutes exist, and what sits under what.                                     | `TODO(institution)` |
| Term dates         | Start, end, and the dates enrolment opens and closes for each term of the year.                                  | `TODO(institution)` |
| Grade scale policy | The platform records A–E, FX, and pass/fail. Which your institution uses is your decision; nothing enforces one. | `TODO(institution)` |

## Part one — setting up

### 1. Create the institution

**Screen:** `/institutions/new`, reached from _Create institution_ in the header.
**Who:** a platform operator only. A platform operator holds no academic permission in any
institution — they can bring one into existence and nothing else (ADR 0016).

Give the institution a code and a name, and name its **first administrator**. That is
either an account that already exists, or an email address that does not: the second case
creates an institution-administrator invitation in the same step, and whoever accepts it
becomes the first administrator.

From here on, every task is done signed in as somebody who holds a role in the
institution. The rest of this guide assumes you are its administrator.

### 2. Build the org tree

**Screen:** _Org units_ (`/institutions/[id]/org-units`).
**Permission:** `role:read` to look, **`institution:manage`** to change.

Add a faculty under the institution, then departments and institutes under the faculty.
A unit can also be added as a root, with nothing above it.

- The tree cannot close into a ring: a unit refuses to become its own parent, or to move
  underneath one of its own descendants.
- A unit cannot be retired while child units, programmes, courses or rooms still hang
  off it. Move or retire those first.

Do this before anything else. Programmes, courses and rooms all hang off a unit.

### 3. Add the rooms

**Screen:** the _Rooms_ card on the same _Org units_ screen.
**Permission:** **`schedule:manage`**.

A room has a code, an optional building, a seat count, and optionally the faculty or
department it belongs to. Rooms group by building in the list.

A room cannot be retired while a class or an exam is booked into it.

### 4. Open an academic term

**Screen:** the _Academic terms_ card on _Catalogue_ (`/institutions/[id]/catalogue`).
**Permission:** `institution:read` to look, **`institution:manage`** to change.

A term carries a code, a name, an academic year, a kind (semester, trimester, summer,
year, other), its start and end, and — separately — the dates **enrolment opens and
closes**.

The enrolment window is the single most consequential field on this screen:

- Set both dates and the term opens for self-service enrolment between them.
- **Leave both empty and the term never opens for self-service enrolment at all.** The
  card says which of the four states each term is in: enrolment open, opens later,
  closed, or never opens.

The server refuses a term that ends before it starts, a window that closes before it
opens, and a window that outlives the term. A term cannot be retired while offerings
still hang off it.

### 5. Add the programmes

**Screen:** the _Programmes_ card on _Catalogue_.
**Permission:** `program:read` to look, **`program:manage`** to change.

A programme has a code, a name, a degree level (bachelor, master, doctoral, other), a
study form (full time, part time, distance), a standard length in semesters, and the org
unit that owns it.

A programme is what a student is admitted to. Without one, nobody can be made a student.

### 6. Add the courses

**Screen:** the _Courses_ card on _Catalogue_.
**Permission:** `course:read` to look, **`course:manage`** to change.

A course has a code, a title, a description, a credit value and an owning org unit. A
course is the thing that exists year after year; it is not yet running.

### 7. Put courses on offer

**Screen:** the _Course offerings_ card on _Catalogue_.
**Permission:** **`offering:manage`**.

An offering is a course paired with a term. Give it a capacity (leave it empty for no
limit), a status and a language.

- A course runs **at most once per term**.
- The list groups by term and flags an offering that is full or has no teacher yet.
- An offering can be retired only while nobody is enrolled. For a course that will not
  run after all, set its status to `cancelled` instead.

Statuses are `planned`, `open`, `running`, `closed` and `cancelled`. A student may only
ask for a place on an offering that is `planned`, `open` or `running`.

### 8. Say who teaches

**Screen:** the teaching-staff panel on a course offering
(`/institutions/[id]/courses/[offeringId]`).
**Permission:** **`offering:manage`**.

Assign a person, give them a teaching role — lecturer, seminar leader, lab supervisor,
examiner or assistant — and optionally name them the lead. There is at most one lead per
offering; naming a second stands the first down.

Two things to know:

- **This is the only way a teacher comes to exist.** The `teacher` role is derived from a
  teaching assignment and cannot be granted on the _Roles_ screen.
- Only somebody who already belongs to the institution can be assigned. Somebody new has
  to be invited first (see _Inviting people_).

### 9. Admit the students

**Screen:** a programme's own page, `/institutions/[id]/programs/[programId]`, linked
from the _Programmes_ card.
**Permission:** `program:read` to look, **`program:manage`** to change.

Admit a person to the programme with a study year. Afterwards you can move them between
**studying**, **interrupted**, **graduated** and **terminated**.

- **This is the only way a student comes to exist.** The `student` role is derived from an
  _active_ programme membership and cannot be granted on the _Roles_ screen.
- A person whose membership is not active is no longer a student, and self-service
  enrolment will refuse them.
- As with teaching, the person must already belong to the institution.

### 10. Divide courses into groups

**Screen:** the _Groups_ panel on a course offering.
**Permission:** **`offering:manage`**.

Open a seminar, lab, exercise or project group with a code, a name and a capacity, then
put students in it.

A group is a subdivision of the roster, so **only somebody who already holds a place on
the course may be in one**. On a term that has not started yet, enrolments are still
`requested` and hold no place — so they are not on the roster and cannot be grouped.
Capacity is enforced in both directions: a full group refuses another member.

### 11. Timetable the classes

**Screen:** the _Timetable_ panel on a course offering.
**Permission:** `schedule:read` to look, **`schedule:manage`** to change.

Schedule a slot once, or weekly to the end of the term. A weekly slot is written as one
class per week, which is what makes the rest possible:

- move a single week without touching the others;
- call off one class, which leaves it listed and struck through and releases its room;
- put a called-off class back on.

A double-booked room is refused. Times render in the institution's time zone.

### 12. Create the exam terms

**Screen:** the _Exam terms_ panel on a course offering.
**Permission:** `schedule:read` to look, **`schedule:manage`** to change.

Offer an exam term with a kind — regular, first retake, second retake or state exam — a
start, an optional end, a seat count, a room, an examiner, and a registration window.

- Students register themselves; see the _User Guide_.
- Moving a term or calling it off **notifies the students holding a seat and the
  examiner** — not everybody enrolled on the course.
- Calling a term off releases its seats.
- The retake ladder is enforced: a student may only register for a first retake after
  failing the regular attempt, and for a second retake after failing the first.
- **A term with no registration window is open for ever.** There is nothing yet that
  closes it automatically.

## Part two — running it

### Inviting people

**Screen:** _Roles_ (`/institutions/[id]/roles`).
**Permission:** **`role:assign`**.

Invite an email address and choose the role it arrives with. The invitation can carry
`course_coordinator`, `program_coordinator`, `registrar`, `org_unit_manager` or
`institution_admin`, at institution scope or inside one faculty, programme or offering.

It cannot carry `student` or `teacher`, because those are not grantable at all — see
below.

The invited person receives a link to `/sign-up?invitation=<token>`, where they set a
password and claim the account. An expired, used or malformed link gives one message:
ask whoever invited you for a new one.

There is no way yet for somebody to request to join an institution themselves. Every
arrival is by invitation.

### Granting and revoking roles

**Screen:** _Roles_.
**Permission:** **`role:assign`, checked at the scope you are granting on.** Granting a
role inside one faculty needs `role:assign` in that faculty; granting institution-wide
needs it institution-wide.

Three rules that will otherwise surprise you:

1. **You may only hand out a role you hold yourself.**
2. **`student` and `teacher` cannot be granted.** They are derived from the academic
   record — an active programme membership and a teaching assignment respectively — and
   appear on this screen read-only. To make somebody a student, admit them to a
   programme. To make somebody a teacher, assign them to an offering.
3. **The last `institution_admin` cannot be revoked.** An institution is never left
   without one.

The grant form still takes a raw account identifier rather than offering a person picker.
Find the identifier on the _People_ screen.

### Finding a person

**Screen:** _People_ (`/institutions/[id]/people`).
**Permission:** `role:read`.

Everybody with a role in the institution, granted or derived, with their roles and
whether they are invited, active or suspended. This is the list to read an account
identifier off.

The list is not searchable or filterable yet. On a demo-sized institution it runs to
around 170 names.

### Correcting an enrolment

**Screen:** the course offering page.
**Permission:** **`enrollment:manage`**.

The registrar's correction verb puts an enrolment into any state — `requested`,
`provisioning`, `active`, `completed`, `withdrawn` or `rejected` — and **is not bound by
the enrolment window or the capacity a student is bound by**. Use it to put somebody into
a full course, or to undo a mistaken withdrawal.

### Recording and publishing grades

**Screen:** the _Grades_ panel on a course offering, to anybody who teaches or
administers it.
**Permissions:** **`grade:propose`** to propose, **`grade:publish`** to publish. They are
checked separately, so a teaching assistant can be given the first and not the second.

- A **proposed** grade is a suggestion the student can see as such.
- Publishing sets the official grade. **It is what the student stands on, and it marks
  their seat on that exam as attended — which is what spends the attempt.**
- A second publication on the same attempt is recorded as a correction, not an overwrite.
- A resit is recorded by naming the next attempt number; it sits beside the first rather
  than replacing it.
- An annulled result has no standing and shows to the student as _No standing_.

Publishing or correcting a grade notifies the student.

### Bulk entry

**Screen:** _Bulk entry_ (`/institutions/[id]/bulk`).
**Permissions:** **`offering:manage`** for course offerings, **`program:manage`** for
programme members. The screen refuses the half you cannot do.

Paste delimited text straight out of a spreadsheet. Tab, semicolon and comma all work,
the first row names the columns, and column names are matched loosely — case, spaces,
underscores and hyphens are ignored.

| Import            | Columns                                                     |
| ----------------- | ----------------------------------------------------------- |
| Course offerings  | `courseCode`, `termCode`, optionally `capacity`, `language` |
| Programme members | `email`, `programCode`, optionally `studyYear`              |

Two rules shape it:

- **A preview is the default.** Nothing is written until you apply. The preview reports
  every row as _to create_, _already there_ or _failed_, with the reason and the line
  number as your spreadsheet counts it.
- **One bad row never fails the batch.** It is reported and the rest proceed.

### Settings, wording and features

**Screen:** _Settings_ (`/institutions/[id]/settings`).
**Permission:** **`institution:manage`**.

Three things live here.

**Language and time** — the default language new members start in, and the institution's
IANA time zone.

**Terminology** — override the words the platform uses: institution, faculty, department,
programme, course, course offering, academic term, student, teacher, student identifier,
credits. Leaving a field empty keeps the platform's own word. The override currently
renders in the org-unit tree only; the course, roster and grades screens still use the
platform wording.

**Feature flags** — seven of them: `courseRegistration`, `examRegistration`, `timetable`,
`grades`, `thesis`, `accommodation`, `fees`. The first four close a real door: switching
one off makes the endpoints behind it refuse and hides its tab from the navigation. The
last three are disabled and say plainly that they are not built.

### Reading the audit trail

**Permission:** **`audit:read`**.

Audit events record who proposed or published a grade, granted or revoked a role,
corrected an enrolment, or cancelled an exam term — with the value before the change and
the request identifier (ADR 0026).

**There is no screen for this yet.** It is readable only through
`GET /api/v1/institutions/{id}/audit-events`.

## What is not here yet

Worth knowing before you plan around it.

- **No request-to-join.** Everybody arrives by invitation.
- **No personal-data export or erasure screen.** See `docs/GDPR Data Inventory.md`.
- **No audit screen**, as above.
- **Absences are not recordable.** Publishing a grade marks a seat attended; nothing
  marks one as a no-show or excused.
- **Learning materials, assignments and submissions are not something an institution
  fills in.** The read surfaces exist and nothing writes to them — this is Phase 2 of
  `docs/Product Plan.md`.
- **Terminology overrides render in one place only**, as above.
- **Slovak is partial.** Strings are keyed as they are built; the translation pass is
  deferred.

## Where to look next

| Document                      | Answers                                         |
| ----------------------------- | ----------------------------------------------- |
| `docs/User Guide.md`          | What a student and a teacher can do             |
| `docs/Feature Status.md`      | Exactly what exists today, audience by audience |
| `docs/Deployment.md`          | Running the platform                            |
| `docs/Backup and Restore.md`  | Taking a backup and proving it restores         |
| `docs/Observability.md`       | What to monitor and what to alert on            |
| `docs/Performance.md`         | How it behaves on an enrolment day              |
| `docs/GDPR Data Inventory.md` | What personal data is held, and where           |
