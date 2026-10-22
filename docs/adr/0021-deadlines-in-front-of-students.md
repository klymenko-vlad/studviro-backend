# 0021 — Deadlines are a calendar layer, not a learning screen

Status: accepted
Date: 2026-09-14

## Context

ADR 0020 filled `learning_activities` with dated activities, but the only screen that read
`due_at` was `/institutions/:id/learning` — an administrative list gated in the navigation on
`sync:read`. A student, who holds neither that permission nor a reason to look at an import
report, could not see a single deadline. The tracker records this as **G3**.

ADR 0013 had already answered the shape question once, for exam terms: a registrar record with a
registration window is not a timetable event with a room, so the calendar fetches the two
separately and interleaves them, labelled, on the day they fall.

## Decision

### A deadline is a third calendar layer, on the same terms as an exam term

`GET /institutions/:id/me/deadlines?from&to[&offeringId]` answers the same range the timetable
and exam endpoints answer, and the week calendar interleaves its rows into the existing day
grouping under a `DEADLINE` label, with its own toggle beside _Show exam terms_. The dashboard
gets a second tile covering the next fourteen days.

No new standalone student screen, and no _Learning_ section on the course page. A deadline is an
instant that belongs on a calendar; a learning space is a container whose only student-visible
content today _is_ its deadlines, so a screen for it would be a list of things already shown.
When `assessments` and `submission_refs` land — G2's remainder — the course page is where that
content belongs, and this decision does not stand in its way.

### `schedule:read` gates it, not `offering:read`

The permission answers "may this person read what is scheduled for them", which is exactly the
question. Reusing it means the deadline layer appears for precisely the callers who already see
the calendar, with no second copy of the rule and no new row in the catalogue.

Scope is the same as the timetable's: rows are returned for offerings the caller is enrolled in
under `ENROLLMENT_PARTICIPATING_STATUSES`, or teaches. An activity the learning system marked
invisible, or one hanging off an invisible space, is never returned — the LMS's own visibility
flag is the institution's answer about what a student may see, and the platform does not
second-guess it.

### The notification family reuses the emitter rather than inventing a second one

`assignment_due_published` and `assignment_due_rescheduled` go through the
`NotificationEmitterService` that ADR 0012 built, with the same `type:subject:day` deduplication
and the same offering audience. `notification_events` gains a nullable `learning_activity_id`
beside `exam_term_id`, so a delivery still points at the row it is about.

An activity is announced only when it carries a deadline: gaining one is `published`, moving one
is `rescheduled`, and a tombstone says nothing — the activity's disappearance from the calendar
is the message, and the LMS dropping a row is not a statement that the work was cancelled.

## Consequences

- The audience is still `ENROLLMENT_PARTICIPATING_STATUSES` — the same set **B10** faults for the
  exam flow. A deadline is enrolment-shaped rather than seat-shaped, so the criticism does not
  transfer, but the teacher of the offering is not told either, and should be when B10 is fixed.
- A deadline whose `due_at` is an evening in UTC lands at midnight in the institution's timezone,
  and the card shows a bare time. `Due 12:00 AM` reads oddly; the date is the day heading above
  it, which carries the meaning but not at a glance.
- Nothing knows whether the student has submitted: `submission_refs` has no importer, so an
  overdue assignment already handed in still reads as past due. That is G2's remainder, and until
  it lands the layer describes the course's schedule rather than the student's standing in it.
