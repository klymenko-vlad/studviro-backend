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

The first screen inside an institution. Three things:

- **Current courses** — the courses you are enrolled in this term, and the credits.
- **This week** — what is scheduled for you next.
- **Your results** — the most recent, with the credits you have earned.

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
leads the course, your own enrolment and its state, your study groups, and your result
for the course once there is one.

### One thing that confuses people

On a term that has not started yet, your enrolment shows as **Requested**, not **Active**.
That is normal. A requested enrolment does not hold a place on the roster, which is why a
course you have signed up for may show a roster of nobody.

## Your timetable

**_Calendar_** shows your week. Three layers sit on it, and each can be switched off:

1. **Classes** — the lectures, seminars and labs of the courses you attend, with the
   room and your study group.
2. **Exam terms** — the exams of those courses.
3. **Deadlines** — a layer that exists and is empty today, because nothing in StudViro
   creates assignments yet.

Move between weeks with the arrows. A class that has been called off stays on the
calendar, marked as cancelled, so you can see that it was meant to happen.

Times are shown in your institution's time zone.

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

## Notifications

**_Notifications_** is what changed in your courses, newest first, with an unread count in
the navigation.

It covers eleven kinds of change: an exam term published, moved or cancelled; an
assignment deadline published or moved; a grade published or corrected; an enrolment
confirmed or refused; a class moved or cancelled; and your own exam registration
confirmed, cancelled or refused by the university.

Notifications are grouped rather than repeated: several of the same kind about the same
thing on the same day arrive as one entry showing how many times it happened. Mark one as
read, or all of them at once.

You are only told about things that concern you. When an exam term moves, the people
holding a seat and the examiner hear about it — not everybody on the course.

## Your account

**_Account_**, from the header, shows your roles across every institution you belong to
and any university accounts linked to your profile.

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
room. The students are told.

**Exam terms** — offer an exam term with a kind, a time, a room, an examiner, a seat
count and a registration window. Moving one or calling it off reaches the students
holding a seat and the examiner. Calling one off releases its seats.

## Your own timetable

**_Calendar_** shows the same week view students get, and includes the courses you teach
as well as any you attend.

---

## What is not here yet

So you are not left looking for it:

- **No course materials, assignments or submissions.** Nothing in StudViro creates them,
  so the deadlines layer on the calendar is empty. This is the next large piece of work.
- **No message or discussion between students and teachers.**
- **No attendance.** Publishing a grade marks a seat attended; there is no way to record
  an absence.
- **No search.** Courses are reachable through the catalogue, your enrolments and your
  teaching list.
- **No export of your own data.**
- **The Slovak translation is partial.** Some strings still render in English.
