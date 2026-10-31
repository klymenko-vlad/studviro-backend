# User Guide

What you can do in StudViro, depending on who you are.

Two short guides follow: one for students, one for teachers. Everything described here
works today. If you are setting an institution up rather than using one, read
`docs/Administrator Guide.md` instead.

## Signing in

Go to `/sign-in` and use your email address and password.

If you have forgotten your password, _Forgot password?_ on that screen leads to a form
that emails you a reset link. The form answers the same way whether or not the address is
known, so nobody can use it to find out who has an account. The link lands on a page that
sets a new password and sends you back to sign in. A link that has expired, already been
used, or was never real gives one message: ask for a new one.

If you were invited, your invitation link takes you to a page where you set a password
and claim the account.

If you belong to more than one institution, there is a switcher in the header. Everything
below is per institution.

**There is no way to sign yourself up to an institution.** Somebody there has to invite
you, or admit you to a programme.

---

# For students

## Your dashboard

The first screen inside an institution. Four things:

- **Current courses** — the courses you are enrolled in this term, and the credits.
- **This week** — what is scheduled for you next.
- **Your results** — the most recent, with the credits you have earned.
- **Deadlines** — what falls due in your courses over the next fortnight.

Each one links through to the full screen.

## Finding and joining a course

**_Enrol_** lists the courses on offer this term. Each card shows the course, the term,
the credits, how many places are left, and whether you may take it.

When you may not, the screen says why in plain words rather than hiding the course:
enrolment for that term has not opened yet, enrolment has closed, there are no places
left, you already hold a place, you have already completed it, or you are not a student
of a programme at this institution. A filter narrows the list to courses you can act on.

Press **Enrol** and the place is yours immediately, subject to two things: the term's
enrolment window must be open, and the course must not be full. If two people take the
last place at the same instant, one of them gets it and the other is told the course is
full.

**Withdraw** gives the place back, and it goes to the next person who asks. You can only
withdraw while the enrolment window is still open.

## Your courses

**_Courses_** lists every course you are enrolled in, newest term first, with the term's
credits and who teaches it.

Withdrawn and rejected enrolments are not shown unless you ask for them by name.

Each course has its own page, reached from the list. It shows the teaching staff and who
leads the course, your own enrolment and its state, your study groups, the course page
your teacher has built, your coursework marks, and your result for the course once there
is one.

### One thing that confuses people

On a term that has not started yet, your enrolment shows as **Requested**, not **Active**.
That is normal. A requested enrolment does not hold a place on the roster, which is why a
course you have signed up for may show a roster of nobody.

## The course page

Below the staff and your enrolment sits the page your teacher has built for the course: a
name, a summary of what the course covers, and two lists under it.

A course page is unpublished while it is being built, and an unpublished page is not shown
to you at all. A course that has nothing there yet says so rather than pretending.

**Materials** are what there is to read: a file to download, a link to follow, or a piece
of text written straight into the page. They are listed in the order your teacher put them
in. A file says what it is called and how large it is before you fetch it. Anything your
teacher has hidden is not listed.

**Assignments** are what you hand in. Each one shows its brief, the dates it opens, falls
due and closes, how many attempts you get — or that there is no limit — how many points it
is worth, and whether work after the due date is accepted. Where a date has not been set,
the assignment says so instead of guessing at one.

## Handing work in

Under each assignment is your own work on it and nobody else's.

Choose one or more files, add a note for the marker if there is anything they should know,
and hand it in. The files go straight to the store, and the assignment is only recorded
once every one of them has arrived — a failure halfway through leaves nothing handed in
rather than half of it.

Each attempt is listed with its number, when it was handed in, and whether it was on time
or late. **Whether a submission is late is decided by the server's clock at the moment you
hand it in**, not by anything your browser says. The screen tells you how many attempts you
have left, and stops offering the form once they are spent.

You may be refused, and the reason is said plainly: the assignment has not opened yet, it
has closed, you have used every attempt, or the due date has passed and this assignment
does not accept late work. **An assignment with no separate closing date closes when it
falls due, unless late work is accepted.**

Your files stay downloadable afterwards, so you can check what you actually sent.

## Coursework marks

Once your work is marked, the course page shows the mark: the points you were given
against the points available, the share of the maximum, when the piece fell due, whether
your hand-in was late, and when it was marked. An assignment that has not been marked yet
says so. An assignment that does not count towards the final grade is labelled as not
counting.

Your marker can write feedback with the points. **It is recorded, but no screen shows it
to you yet.**

These are marks for pieces of work. They are not your grade for the course — that is a
separate, deliberate act by your teacher, and it appears under your results.

## Your timetable

**_Calendar_** shows your week. Three layers sit on it, and each can be switched off:

1. **Classes** — the lectures, seminars and labs of the courses you attend, with the
   room and your study group.
2. **Exam terms** — the exams of those courses.
3. **Deadlines** — the assignments of those courses, on the day they fall due. Each one
   names the course page it belongs to and says whether it is open, not open yet, past
   due, or handed in — and if you handed it in late, that it was late.

Move between weeks with the arrows. A class that has been called off stays on the
calendar, marked as cancelled, so you can see that it was meant to happen.

Times are shown in your institution's time zone.

### Your own tasks and events

The calendar is also yours to write in. **_New event_** adds something with a start and an
end — training, a shift, a doctor's appointment — and **_New task_** adds a to-do, with a
due time if it has one. They appear on the calendar marked _Personal_, in your calendar
subscription and in `studviro.ics`, and a task with a due time shows on the dashboard's
_Deadlines_ tile beside your coursework. A fourth switch, _Show my own events and tasks_,
hides them.

The **_My tasks_** tab lists your tasks, soonest due first, with a search box and a choice
of open, done or all. Tick the circle to mark one done; the pencil opens it to edit or
delete it. Click an event on the calendar to change or delete it.

Nobody else sees any of this — not your teachers and not the institution's administrators.

### In Google Calendar, Outlook or Apple Calendar

The card at the foot of the calendar page puts your StudViro calendar into the calendar app
you already use. **_Create subscription link_** makes a private address for it; while the
address is on screen, the buttons under it subscribe in one click: **_Google Calendar_**,
**_Outlook.com_**, **_Microsoft 365_**, and **_Apple Calendar_**, which also opens any
other app that understands `webcal` links. Only the service you click receives the link.
The address is shown once; to subscribe another app later, replace the link and subscribe
again — the old one stops working. **_Download .ics_** gives you the whole calendar as a
file instead.

To take just one thing with you, switch the calendar to **_List_** and press
**_Add to calendar_** on a class, a deadline, or an exam you are registered for. You get a
small `.ics` file with that one event; open it and your calendar app adds it. It is a copy:
if the class moves later, the copy does not, unless you also subscribe.

## Exams

**_Exams_** lists the exam terms of the courses you attend, upcoming and past. Each one
shows when it is, the room, the examiner, how many seats are free, and the registration
window.

Filter by course, by kind — regular, first retake, second retake, state exam — and by
whether you can act on it right now.

**Register** takes a seat. If you cannot, the screen says why:

- registration has not opened yet, or has closed;
- the term is full;
- you are already registered for another term of this course;
- you are not enrolled in the course;
- **a retake is only open to you once you have failed the attempt before it.** You cannot
  register for a first retake before the regular exam has been sat and failed, nor for a
  second retake before the first.

**Cancel** gives the seat up while registration is still open. A cancellation stays
visible rather than disappearing, so you can see what you did.

If the university calls a term off or moves it, you are told.

## Your grades

**_Grades_** lists every result recorded for you, by term, with the credits you have
earned and your weighted average. The same result also appears on the course's own page.

A result can be at one of three stages, and the screen tells you which one you are
looking at:

- **Calculated** — worked out from your marks. Not a decision.
- **Proposed** — what your teacher suggests. Not yet official.
- **Official** — the grade you stand on.

Two more cases:

- A **resit** is a second attempt shown beside the first, not instead of it.
- An **annulled** result shows as _No standing_.

The screen also totals how many courses are waiting on a resit.

### Where you are in your programme

Above your results, the same screen shows your standing in each programme you are actively
admitted to: your study year, the credits you have earned against the credits the
programme asks for, how many are left, and what share of the way that is. A programme you
have finished the credits for says so.

The total comes from the programme's standard length, at thirty credits a semester. **A
programme with no recorded length gets no bar**: the screen says it has nothing to measure
against rather than showing you a figure it cannot stand behind. And the credits are not
the whole degree — they say nothing about a final examination, a thesis, or a compulsory
course you have not taken.

## Searching

**_Search_** is one box over everything you are allowed to see: courses, the courses on
offer, programmes, people, org units and rooms. Type at least two characters and the
matches arrive grouped by kind, each linking to where the thing lives.

Your permissions decide what is searched, not what is hidden afterwards, and the screen
names the kinds it did not look at rather than leaving you to wonder why a room never
appears. When there are more matches than it will show, it says so and asks for a longer
query.

## Notifications

**_Notifications_** is what changed in your courses, newest first, with an unread count in
the navigation.

What reaches you today: an exam term published, moved or cancelled; a grade published or
corrected; your enrolment confirmed or refused; and your own exam registration confirmed
or cancelled. A class being moved or called off, and an assignment being set or its
deadline moved, are kinds the system knows about and nothing raises yet — watch the
calendar for those.

Notifications are grouped rather than repeated: several of the same kind about the same
thing on the same day arrive as one entry showing how many times it happened. Mark one as
read, or all of them at once.

You are only told about things that concern you. When an exam term moves, the people
holding a seat and the examiner hear about it — not everybody on the course.

## Your account

**_Account_**, from the header, shows your roles across every institution you belong to
and any university accounts linked to your profile.

Each institution you belong to is listed there with a way to take a copy of everything it
holds about you. The copy downloads as a single file, and you can ask for it whenever you
like without going through anybody.

---

# For teachers

Your `teacher` role comes from being assigned to a course offering. Nobody grants it by
hand; if you should be teaching something and it is not listed, ask whoever administers
the offering to assign you.

## Your teaching

**_Teaching_** lists every course offering you teach, newest term first. Each one shows
your teaching role — lecturer, seminar leader, lab supervisor, examiner or assistant —
whether you are the lead, how many students are enrolled, and against what capacity.

Each links to the offering's own page, which is where the work happens.

## Your roster

The **Roster** panel on a course offering lists the students on it, their enrolment
state, their study groups and when they enrolled. It is visible to whoever teaches or
administers the offering.

Withdrawn and rejected students are excluded from both the list and the count, and the
two agree with each other. Students whose enrolment is still **Requested** hold no place
and are not on the roster — which is why a course in a term that has not started can show
a roster of nobody against a real seat count.

## The course page

Every offering can carry one course page, and it is authored here rather than derived from
anything. Where there is none, the panel offers to open one, named after the course unless
you say otherwise, with a short name and a summary.

**A new page is unpublished, and an unpublished page is invisible to your students.** That
is deliberate: a course is built before it is shown. Publish it from the same panel when it
is ready, and unpublish it again if you need to.

Teaching the course is standing enough. You do not need a coordinator's permission, and
you do not need anybody to create the page for you: if you teach the offering, it is yours
to open, build and publish. Somebody who administers offerings across the institution can
do the same, which is how a course with no teacher yet gets a page at all.

What you cannot do is author somebody else's course. Teaching one offering says nothing
about another, and the panel will refuse it.

Anybody who may read the institution's offerings also has a **_Learning_** screen in the
navigation: every course page in the institution, with the offering it belongs to, how
many activities are in it and the next deadline it carries. It flags any page that names a
course offering which no longer exists.

## Materials

Materials are what there is to read, in the order you put them in. Three kinds:

- **File** — chosen from your machine and uploaded straight to the store; the server
  records what actually arrived, not what the browser claimed.
- **Link** — an address somewhere else.
- **Text** — written into the page itself.

Each carries a title and an optional line of description. You can move one up or down the
list, hide it from students while leaving it in place, show it again, or remove it.

## Assignments

An assignment is a piece of work, and setting one is where the dates are decided:

- **Opens** — nothing may be handed in before it.
- **Due** — after this, work is late.
- **Closes** — after this, nothing is accepted at all. Leave it empty and **the due date
  closes the assignment, unless you accept late work**.

The dates must run in that order or the assignment is refused. Alongside them you set how
many attempts a student gets — between one and a hundred, or empty for no limit — how many
points the work is worth, whether late work is accepted, and whether it counts towards the
final grade.

An assignment is also hidden or shown to students independently of the course page, and it
can be edited or removed after the fact. Setting one creates the gradebook column that
marking later fills; you do not have to make one yourself.

Deadlines you set here are what your students see on their calendar and on their dashboard.

## Marking what is handed in

Under each assignment, whoever may propose a grade sees every submission on it: the
student, which attempt it is, when it arrived, whether the server recorded it as late, and
the files, each one downloadable.

Give it points — against the maximum, where you set one — and write feedback. That records
a coursework mark, which the student sees on their course page beside the rest of their
marks for the course. The feedback is stored but not yet shown to them.

A coursework mark is not the course grade. That remains the separate, deliberate act
described next.

## Grades

The **Grades** panel on a course offering carries one row per student, with every attempt
they hold.

- **Propose** a grade to record what you think it should be. The student sees it as a
  proposal.
- **Publish** a grade to make it official. **A published grade is what the student stands
  on, and it marks their seat on that exam as attended — which is what spends the
  attempt.** Publishing notifies the student.

These are two separate permissions. A teaching assistant can be given the first without
the second, and the panel says which of the two you hold.

Recording a **resit** means naming the next attempt: it sits beside the first rather than
replacing it. Publishing again on the same attempt is recorded as a correction, not an
overwrite, and the student is notified of that too.

The grade values are A, B, C, D, E, FX, and pass/fail.

## Groups, timetable and exam terms

Three more panels sit on the course offering page. Whether you see them depends on the
permissions you hold, not on teaching the course: `offering:manage` for groups,
`schedule:manage` for the timetable and exam terms. A lecturer is often given them; an
assistant often is not.

**Groups** — open a seminar, lab, exercise or project group with a capacity, put enrolled
students into it and take them out again, and close it when it is done. Only somebody who
holds a place on the course can be in a group, and a full group refuses another member.

**Timetable** — schedule a class once or weekly to the end of term. Because a weekly slot
is written as one class per week, you can move a single week, call one class off, or put
a called-off class back on, without touching the rest. A room that is already booked at
that hour is refused. A called-off class stays listed, struck through, and releases its
room. The change shows on everybody's calendar, but no notification goes out about it yet.

**Exam terms** — offer an exam term with a kind, a time, a room, an examiner, a seat
count and a registration window. Moving one or calling it off reaches the students
holding a seat and the examiner. Calling one off releases its seats.

## Your own timetable

**_Calendar_** shows the same week view students get, and includes the courses you teach
as well as any you attend.

---

## What is not here yet

So you are not left looking for it:

- **No message or discussion between students and teachers.** A note to the marker on a
  submission, and feedback on a mark, are the only writing that travels between the two.
- **No quizzes.** Assignments are things handed in, marked by a person. Nothing in
  StudViro asks questions or marks answers, and nothing is planned to.
- **No attendance.** Publishing a grade marks a seat attended; there is no way to record
  an absence, and the two absence states the system knows about are never set.
- **No notification when an assignment is set or marked, or when a class moves.** The
  calendar carries those; the notifications list does not.
- **The Slovak translation is partial.** Some strings still render in English.
