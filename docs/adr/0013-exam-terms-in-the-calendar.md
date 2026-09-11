# 0013 — Exam terms in the calendar, and registration availability on the read

Status: accepted
Date: 2026-09-11

## Context

Step 39 shipped a week calendar over `timetable_events`; steps 42–43 shipped an exams screen
over `exam_terms` and the registration writes behind it. Both reads already took an
`offeringId` and a type or kind, and neither screen exposed them, so a student with six
courses read all six every week. Two questions had to be settled before exposing them.

**Where does an exam term belong on the calendar?** `timetable_events.type` already has an
`exam` member, so an importer could write exam terms into the timetable and the calendar
would need no new code at all.

**Why is a registration button disabled?** The exams screen inferred it from the registration
window beside it, which is wrong twice over: it is a second copy of rules the server enforces,
and it cannot express the rule that matters most in practice — a student may hold only one
live registration per course offering, so a free seat on a sibling term is unreachable for a
reason nothing on the card mentions.

## Decision

### An exam term is a second layer, not a timetable event

The calendar fetches `me/timetable-events` and `me/exam-terms` for the same week and
interleaves them by start time in the client. It does not synthesize timetable events from
exam terms, and no importer writes an exam term into `timetable_events`.

The two are different records. A timetable event is a recurring class with a room, a study
group and a duration. An exam term is a registrar record with a registration window, a seat
count, an examiner and a registration the caller may hold. Folding one into the other would
either lose those fields or push them into a timetable event that has no business carrying
them, and it would blur provenance: `source_system` would say `sis` for both, with nothing
distinguishing an imported class from an imported exam.

The cost is one extra request per week and a client-side merge. The benefit is that each card
keeps the shape of the thing it describes, and the reader can turn the exam layer off.

### The server answers whether the caller may act, and why not

`MyExamTerm` carries `registrationAvailability`: `canRegister`, `canCancel` and a
non-nullable `reason` — one of `open`, `registered`, `teaching`, `cancelled`, `not_open`,
`closed`, `other_term_registered`, `full`. It is computed from the same rules
`MyExamRegistrationsService` enforces on the write, including a per-row `exists` over the
caller's live registrations on sibling terms of the same offering.

The client gates its buttons on those booleans and renders the reason only where nothing else
on the card says it: `not_open` and `closed` are already spelled out by the window label and
`registered` by the badge, so only `teaching`, `cancelled`, `full` and
`other_term_registered` become a sentence. "Only what I can act on" filters on
`canRegister || canCancel` — the server's answer, never a re-derivation of it.

`reason` is a plain enum rather than a nullable one because the OpenAPI-to-TypeScript
generator drops OpenAPI 3.0's `nullable` on an enum schema, producing a client type that
would not admit the `null` the server sends. `open` says the same thing more directly.

## Consequences

- The read is now the single source of truth for what a student may do with an exam term. A
  new rule on the write must be mirrored in `registrationAvailability` or the button will
  offer an action the server refuses.
- The availability is computed at read time against `now`. A term whose window closes while
  the page is open still shows an enabled button until the query refetches; the write
  refuses it and the error surfaces as a toast.
- `other_term_registered` costs one correlated subquery per row. The result set is bounded by
  the caller's own offerings, so this is not paginated and has not needed an index beyond the
  ones `exam_registrations` already carries.
- Filtering is server-side for `offeringId` and the type or kind, so the course picker is fed
  by a second, unfiltered query for the same period. When no filter is set the two share a
  cache entry and only one request goes out.
