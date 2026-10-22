# 0012 — Notification aggregation and deduplication

Status: accepted
Date: 2026-08-29

## Context

Every read shipped so far is pull-only: a student learns that an exam term moved by opening
the exams screen. Step 44 adds the first push. Nothing in the canonical model records a
notification, so the step owns its own tables, and the substance of it is the rule that keeps
a noisy source system from becoming a noisy inbox: one exam term rescheduled twice inside a
synchronization run must reach a student once.

## Decision

### Two tables: an event and a per-recipient delivery

`notification_events` records what happened, once per institution. `notification_deliveries`
records who must see it and whether they have. Both carry `institution_id` and the standard
provenance columns, because a notification derived from an imported change is as much a
synchronized artefact as the change itself — `source_system` names the system whose record
moved.

Splitting them is what makes aggregation possible at all: an exam term that moves twice is one
event with many deliveries, not one row per student per move.

### Deduplication is a database constraint, not application logic

Every event carries a `dedupe_key`, unique per institution among live rows. The emitter inserts
with `on conflict do nothing`; a losing insert falls back to updating the event it collided
with. Two concurrent workers emitting the same change therefore produce one event without a
lock, and the rule cannot be bypassed by a code path that forgets to check.

### The key carries an aggregation window

The key is `type:subject:window`, where the window is the UTC day the change was observed in.
Within a day, every further move of the same exam term folds into the same event: the payload
is overwritten with the newest values, `occurred_at` moves forward and `occurrence_count`
increments. The next day the same term moving produces a new event, because a change a week
later is news again rather than a repeat.

The window is part of the key rather than a timestamp comparison in the service, so the
constraint and the rule are the same thing. A rescheduled-twice-in-one-run term is the
degenerate case: both emissions land in the same window and the student sees one entry that
says the term moved, with the latest time.

### Re-occurrence re-surfaces a read delivery

Folding a second change into an existing event clears `read_at` on its deliveries. A student
who read "moved to Tuesday" and does not re-read "moved to Thursday" would otherwise be worse
off than one who never opened the inbox. Aggregation must never lose a change.

### Recipients are the offering's live enrolments

An exam-term notification goes to every student with a live enrolment in the offering, not only
to those already registered for the term: a published or moved term is precisely what an
unregistered student needs to know. Teaching staff are not notified of changes they make.

### Reading is the recipient's own business

The catalogue gains `notification:read`, held by every role that can be a recipient. It gates
`GET institutions/:id/me/notifications`, the unread count and the two mark-read writes. Every
route is scoped to the caller's own deliveries: there is no route that reads or writes another
person's inbox, so the permission alone can never leak one.

## Consequences

- Emission happens where the importer already detects the change, not in a poller: the exam
  terms importer compares the row it replaced against the row it wrote.
- Nothing yet emits for grades, enrolments or timetable events. The emitter takes a change and
  a recipient query, so adding those is a new caller, not a new mechanism.
- No channel other than the in-app inbox exists. Email and push would attach to a delivery row,
  which is why delivery is a table and not a boolean on the event.
