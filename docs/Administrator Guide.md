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

Three things to know:

- **This is the only way a teacher comes to exist.** The `teacher` role is derived from a
  teaching assignment and cannot be granted on the _Roles_ screen.
- The teaching role **assistant** derives `teaching_assistant` rather than `teacher`,
  which is the difference between proposing a grade and publishing one.
- Only somebody who already belongs to the institution can be assigned. Somebody new has
  to be invited first (see _Inviting people_).

A teaching assignment is also what makes somebody the author of that course's page, so
this step is worth doing before the teaching staff want to start building one.

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

### 13. Open the course page

**Screen:** the course-page panel on a course offering.
**Permission:** `offering:read`, which every member of the institution holds — but the
panel only offers to build anything to somebody the course belongs to. That is whoever
**teaches the offering**, or anybody holding **`offering:manage`** across the institution.

A course page — a **learning space** — is authored per offering, never derived from
anything else (ADR 0028). There is at most one per offering, and a new one is
**unpublished**, so a course can be built before anybody sees it.

**The teacher of an offering can open and publish their own.** They do not need an
administrator to do it for them. An administrator matters here for the courses nobody
teaches yet, for the ones whose staff want help, and for seeing the whole institution's
pages at once (see _Course pages across the institution_).

A page carries a name, an optional short name and a summary, and holds two ordered lists.

**Materials** — files, links and notes, in the order students read them. A file goes from
the browser straight to the object store and never through the API; the server then asks
the store what it actually received and records that, rather than what the browser
claimed. Each material can be hidden, shown again, and moved up or down the list.

**Assignments** — what students hand in. An assignment has a brief, an opens/due/closes
window, how many attempts a student gets (empty for unlimited), whether work after the
due date is accepted, the points available, and whether it counts towards the final grade.
Creating one also opens its gradebook column; withdrawing it takes the column with it.

The rules the server keeps, whoever set the assignment:

- the dates must run opens → due → closes;
- an attempt limit is between 1 and 100, or absent for unlimited;
- nothing may be handed in before it opens or after it closes;
- **with no closing date, the due date closes the assignment** unless late work is
  accepted;
- whether a submission is late is decided by the server's clock when the row is written.
  A client that tries to say otherwise is refused, not ignored.

Visibility is absence, not greying out. An unpublished space, a hidden material and an
invisible assignment are **not found** for a student rather than shown as forbidden, and
the teacher of one course cannot list or mark another course's submissions.

Uploads are capped — 64 MiB per file by default, a deployment setting — and file
materials and submissions need the object store configured; see `docs/Deployment.md`.

## Part two — running it

### Inviting people

**Screen:** _Roles_ (`/institutions/[id]/roles`).
**Permission:** **`role:assign`**.

Invite an email address and choose the role it arrives with. The invitation can carry
`course_coordinator`, `program_coordinator`, `registrar`, `org_unit_manager` or
`institution_admin`, at institution scope or inside one faculty, programme or offering.

It cannot carry `student`, `teacher` or `teaching_assistant`, because those are not
grantable at all — see below.

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
2. **`student`, `teacher` and `teaching_assistant` cannot be granted.** They are derived
   from the academic record — an active programme membership and a teaching assignment
   respectively — and appear on this screen read-only. To make somebody a student, admit
   them to a programme. To make somebody a teacher, assign them to an offering.
3. **The last `institution_admin` cannot be revoked.** An institution is never left
   without one.

The grant form still takes a raw account identifier rather than offering a person picker.
Find the identifier on the _People_ screen, or by searching.

### Finding a person

**Screen:** _People_ (`/institutions/[id]/people`).
**Permission:** `role:read`.

Everybody with a role in the institution, granted or derived, with their roles and
whether they are invited, active or suspended. This is the list to read an account
identifier off.

The list itself is not filterable, and on a demo-sized institution it runs to around 170
names. To find one person rather than read the list, search.

### Searching the institution

**Screen:** _Search_ (`/institutions/[id]/search`).
**Permission:** `institution:read` to reach the screen; what it looks through depends on
what else you hold.

One box over six kinds at once — courses, course offerings, programmes, people, org units
and rooms — matching on names, codes and email addresses. Two characters are enough to
run it; each hit links straight through to its own screen.

**Permission decides what is searched, not what is filtered out afterwards.** A kind you
cannot read is never queried at all, so an empty result can never be read as proof that
something does not exist. The screen says plainly which kinds it left out and why:

| Kind             | Needs           |
| ---------------- | --------------- |
| Courses          | `course:read`   |
| Course offerings | `offering:read` |
| Programmes       | `program:read`  |
| People           | `role:read`     |
| Org units        | `role:read`     |
| Rooms            | `schedule:read` |

Each kind returns at most eight hits. When there are more, the screen says so and asks for
a longer query rather than paging.

### Correcting an enrolment

**Screen:** the course offering page.
**Permission:** **`enrollment:manage`**.

The registrar's correction verb puts an enrolment into any state — `requested`,
`provisioning`, `active`, `completed`, `withdrawn` or `rejected` — and **is not bound by
the enrolment window or the capacity a student is bound by**. Use it to put somebody into
a full course, or to undo a mistaken withdrawal.

### Marking what students hand in

**Screen:** the submissions list under each assignment on a course offering.
**Permissions:** **`grade:read`** to see what was handed in, **`grade:propose`** to mark
it. As with grades, only somebody the course belongs to sees the list at all.

Each row is one student's latest attempt, with its files, when it arrived and whether it
was late. Marking gives it points out of the assignment's maximum and written feedback,
and writes the result into that assignment's gradebook column.

**A mark on an assignment is not the official course grade.** It is a working mark the
student sees against that piece of work. The course grade is still the separate,
deliberate act described below, and nothing promotes one into the other.

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

### Course pages across the institution

**Screen:** _Learning_ (`/institutions/[id]/learning`).
**Permission:** `offering:read`.

Every learning space in the institution, with how many assignments each carries and when
the next one falls due, and a warning for any space that names an offering which no longer
exists. It is the place to see which courses have a page at all and which are still empty
a week before term.

Holding `offering:manage` across the institution makes you an author of **every** course
page here, not only the ones you teach — which is what lets an administrator finish a page
for a course whose teacher has not been assigned yet. Use it sparingly; the teacher can do
their own.

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
credits. Leaving a field empty keeps the platform's own word. The override reaches the
org-unit tree, the catalogue, the offerings list, the programme page and the student
columns of the grade and marking tables — headings and labels, not yet every sentence in
which the word appears.

**Feature flags** — seven of them: `courseRegistration`, `examRegistration`, `timetable`,
`grades`, `thesis`, `accommodation`, `fees`. The first four close a real door: switching
one off makes the endpoints behind it refuse and hides its tab from the navigation. The
last three are disabled and say plainly that they are not built.

### Reading the audit trail

**Screen:** _Audit_ (`/institutions/[id]/audit`).
**Permission:** **`audit:read`**, held by `institution_admin` alone.

Who changed what, and what it was before: a grade proposed or published, a role granted or
revoked, an enrolment corrected, an exam term cancelled, a person erased (ADR 0026).
Filter by action, and read older entries by paging back through time.

Reads are deliberately not recorded, and neither is self-service: a student enrolling
themselves is not an intervention in somebody else's record, while a registrar correcting
the same row is. The raw feed is also available at
`GET /api/v1/institutions/{id}/audit-events`.

Nothing prunes the table yet, and for how long the trail is kept is `TODO(institution)`.

### Personal data: copies, deactivation and erasure

This is the part of the product where a mistake cannot be undone, so read it before you
need it. **Deactivating an account and erasing a person are different acts with different
endpoints**, and only one of them is reversible.

**A copy of their own data** is self-service. Anybody can download everything this
institution holds about them from their account screen, one file per institution they
belong to. No administrator is involved, and you cannot take the copy on their behalf.

**Deactivating an account** — `DELETE /api/v1/users/{id}` — stops the account working. It
can no longer be used or listed. **It is not an erasure**: the name, the email address,
and everything the institution wrote about the person stay exactly where they were. Use it
for somebody who has left, or an account opened in error.

**Erasing a person** — the erasure control on their row on the _People_ screen, behind
**`institution:manage`**, or `DELETE
/api/v1/institutions/{institutionId}/people/{userId}/personal-data` — is the real thing,
and is irreversible (ADR 0030). It:

- anonymises the account: an unroutable placeholder address, a neutral display name, no
  password, and every outstanding session killed on the spot;
- hard-deletes credentials and contact rows — refresh tokens, password-reset tokens,
  extra email addresses, external identities, and this institution's invitations to them;
- deletes their submitted work from the object store, and the rows naming those files;
- clears free text a person wrote about them, including marking feedback;
- **keeps the academic record.** Enrolments, results, exam registrations, programme
  memberships and assessment results all stay, pointing at a row that no longer says who
  it was. The institution can still say that somebody passed; it can no longer say who.

Two refusals to expect. Erasure is scoped to one institution, and is **refused while
another institution still has an active relationship with the person** — it names the fact
rather than the other institution. And because it cannot be undone, the screen makes you
type the person's email address rather than press a button.

Who inside the institution is authorised to execute an erasure, and how long the
anonymised academic record is then kept, are both `TODO(institution)`.

### Sessions and tokens

Each sign-in writes a session row carrying an IP address and a user agent, and each
password reset writes a token. **Both are swept nightly once they have expired**, so
neither accumulates a year of device-and-location history behind an account that is simply
in daily use.

Expiry is the boundary, not a retention period, so there is no number for you to choose. A
refresh token that has been revoked but not yet expired is kept on purpose: it is exactly
what has to still be found when a leaked token comes back.

## What is not here yet

Worth knowing before you plan around it.

- **No request-to-join.** Everybody arrives by invitation.
- **No quizzes, by decision rather than by omission.** StudViro takes work in and marks
  it; it does not run timed, auto-marked question banks, and there is no plan to
  (ADR 0028).
- **Absences are not recordable.** Publishing a grade marks a seat attended; nothing
  marks one as a no-show or excused.
- **Setting or moving an assignment notifies nobody.** The deadline appears on the
  student's calendar and dashboard, and a mark appears on their course page, but neither
  raises a notification the way a published grade or a moved exam term does. Say it in
  class.
- **Deleting a material or a submission leaves the file in the object store.** The row
  goes and the file stops being reachable, but only an erasure actually removes objects.
- **No person picker on the grant form**, as above.
- **Terminology overrides do not reach every screen**, as above.
- **Slovak is partial.** Every string is keyed in both languages, but most Slovak values
  are still the English text; the translation pass is deferred.

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
