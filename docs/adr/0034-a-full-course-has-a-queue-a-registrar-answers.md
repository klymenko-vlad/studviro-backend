# 0034 — A full course has a queue, and a registrar answers it

Status: accepted
Date: 2026-09-23

## Context

A student who asked for a place on a full course got `OFFERING_FULL`, and nothing
else happened. They had nowhere to record that they wanted in, so the registrar found
out by email, if at all. The schema already had a `requested` status, but it holds a
seat. A request that has not been answered has to count against capacity, or two
students could both be given the last place. Reusing `requested` for "waiting" would
have filled the course with people who are not on it.

## The options

**Promote automatically.** When a place frees up, give it to whoever has waited
longest. This is what many student systems do. But a place can free up after the
window closes, or reach a student who has since enrolled elsewhere, and in both cases
the system decides something a registrar would want to decide.

**Registrar answers.** The queue is a list. The registrar admits from it, going past
capacity if they choose, or refuses. Meanwhile a queueing student may take a place
that frees up while the window is open, the same as anyone else.

## Decision

The registrar answers. `waitlisted` is a new enrolment status. It holds no seat, is
not on the roster, and the student can leave it at any time, even after the window
closes, because it holds nothing. `enrollments.waitlisted_at` fixes the order.

- A student may join the queue only while the course is full. Otherwise they get
  `OFFERING_NOT_FULL`, because the place is the better answer.
- A queueing student sees `canEnroll` flip to true the moment a place frees up.
- The registrar reads the queue at `GET …/course-offerings/:id/waitlist`, behind
  `enrollment:manage`, and answers with the existing correction verb. That verb
  now sends `enrollment_confirmed` or `enrollment_rejected`, so both answers reach
  the student.
- A registrar can now open the course page and its roster. Either
  `offering:manage` or `enrollment:manage` makes the caller the offering's
  administrator. Without that, the person who answers the queue could not see it.

## Consequences

- Nothing tells a queueing student that a place has freed up. They find out by
  looking at the enrolment screen. A notification for that is a small addition if
  anyone asks for it.
- The queue has no cap and nothing expires it. At the end of term it stays as it
  was, and a registrar can refuse whatever is left.
