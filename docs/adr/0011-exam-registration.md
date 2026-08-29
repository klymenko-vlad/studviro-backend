# 0011 — Self-service exam registration

Status: accepted
Date: 2026-08-29

## Context

Step 42 shipped the exam-term read: a student sees every term of an offering they attend,
with its capacity, seats still free, registration window and their own registration. Step 43
is the write. The read already surfaces every rule the write has to enforce, so the question
was not what to check but who may call it, and how many live registrations a student may hold
for one course.

## Decision

### A permission of its own: `exam:register`

`docs/STATUS.md` proposed gating the write on `enrollment:manage`. That permission belongs to
registrars and course administrators; a student does not hold it and must not, because it also
governs changing _other people's_ enrolments. Gating self-service registration on it would
have made the feature unusable by the only audience that needs it.

The catalogue therefore gains `exam:register`, granted to every role that can be a student of
a course — students, teaching assistants, teachers and registrars — and, as always, to an
institution admin. The permission answers "may this person register themselves"; the domain
rules answer "for this term".

### The route is scoped to the caller

`POST institutions/:id/me/exam-registrations` and
`DELETE institutions/:id/me/exam-registrations/:registrationId` act only on the caller's own
rows: the user id comes from the session, never from the payload. Cancelling someone else's
registration is a 404, not a 403 — the caller has the permission, the row is simply not theirs
to see.

### One live registration per course, not per term

The partial unique index on `exam_registrations` already forbids two live registrations for
the same term. We extend that to the offering: a student holding a live registration for the
regular term cannot also hold one for the retake. This is standard SIS practice — the retake
exists because the first attempt did not succeed — and it keeps seat counts honest. Cancelling
frees the student to register for any term of that course again.

### Cancelling soft-deletes

Cancellation sets `status = 'cancelled'`, stamps `cancelled_at`, and sets `deleted_at`. The
`deleted_at` stamp is what lets the same student register again: the partial unique index
counts only live rows. The cancelled row stays for history. Cancellation is refused once the
registration window closes, except for a term the institution itself cancelled.

### Serializable, because capacity is a race

Capacity is checked and the row inserted in one serializable transaction. Two students taking
the last seat concurrently is the ordinary case, not the exotic one, and a read-committed
check would let both through.

## Consequences

- The permission catalogue is one entry larger, and `GET /me/permissions` now reports
  `exam:register` for students — the client gates the button on that answer.
- A student cannot hold a regular and a retake registration at once. If an institution ever
  needs both, the rule is in `MyExamRegistrationsService`, not in the schema.
- Nothing writes registrations from a connector yet; imported terms still show
  `myRegistration: null` until an import brings registrations in.
