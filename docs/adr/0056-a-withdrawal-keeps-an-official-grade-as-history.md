# 0056 — A withdrawal keeps an official grade as history

Status: accepted
Date: 2026-10-31

## Context

Every read over a student's results and course history asked whether the enrolment was in
`ENROLLMENT_RECORDED_STATUSES` (provisioning, active, completed). A registrar who corrected
an enrolment to `withdrawn` after its official grade was published therefore erased the
grade from the student's view: it vanished from _My grades_ and from the credit total, the
course page refused the student, and every old notification about that course led to _not
yours to see_. The student was told nothing (tracker B48).

The choice was to refuse a withdrawal once an official grade exists, or to let it through
and keep the grade. The user chose the second on 2026-10-31.

## Decision

- **The withdrawal goes through.** A registrar's correction to `withdrawn` is not refused
  because of a grade; the enrolment reads as withdrawn everywhere it is shown.
- **An official grade survives it.** A result row with an `official_grade` stays on the
  student's record when its enrolment is withdrawn: in _My grades_, in the credit total and
  the weighted average, and on the course page's grade panel. A `calculated` or `proposed`
  result does not — nothing was ever recorded, so the withdrawal drops it as before.
- **The status says so.** Each result carries its `enrollmentStatus`, and the client marks a
  withdrawn one _Withdrawn_ with a line saying the grade stays on the record.
- **The course page still opens** to a student withdrawn after an official grade, as a
  student with a `withdrawn` enrolment, so their grade panel and every old notification
  linking to it keep working. The same rule (`holdsCourseRecord`) decides which course pages
  search offers and which links a teacher profile makes. A student withdrawn before any
  official grade is refused the page as before.
- **Nothing else reopens.** The course's materials, assignments, discussion, timetable and
  exam terms stay closed to the withdrawn student; those follow participation, and a
  withdrawn student no longer participates. The client shows them only the page's
  _Overview_ and _Grades_ tabs and calls them _Withdrawn_ rather than _Enrolled_. The roster and the teacher's grade table do
  not list them.
- **The student is told.** A registrar's withdrawal raises a new notification type,
  `enrollment_withdrawn`, in the enrolment group of the e-mail settings. It opens the
  enrolment screen rather than the course page, which may now refuse them. A student who
  withdraws themselves is not notified about their own act.
- **Annulment remains the way to strike a grade.** A withdrawal does not annul anything; a
  registrar who means the grade to count for nothing annuls the result, which shows as _No
  standing_ whether or not the enrolment is withdrawn.

## Consequences

The registrar gets a _Withdraw_ action on the course roster, behind `enrollment:manage`,
with a confirmation that says an official grade stays. Before this the correction existed
only in the API.

A withdrawn student's official grade earns its credits. If an institution wants a
withdrawal to cost the credits, it annuls the result as well; that is a policy question for
the institution, not a rule the system guesses.

The teacher's grade table still lists only recorded enrolments, so a teacher cannot see or
correct the kept grade of a withdrawn student there. A registrar who needs to correct one
reverses the withdrawal first.
