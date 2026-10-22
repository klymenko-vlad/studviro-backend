# 0023 — Write-back: how a decision taken in StudViro reaches the source system

Status: accepted
Date: 2026-09-18

## Context

Every connector is read-only. `AcademicSystemConnector` declares `registerForExam` and
`registerForCourse` as optional methods, `LearningSystemConnector` declares `provisionCourse`
and `upsertEnrollment`, and nothing implements or calls any of the four. There is no cancel
command, no queue, no retry and no record that a write was ever attempted.

The consequence is not cosmetic. A student who registers for an exam in StudViro is not
registered at the university; `exam_registrations` is not a `SYNC_DOMAIN`, so a source-side
registration is never imported either, and the next full run leaves the two systems quietly
disagreeing with nobody to notice. The same will be true of a proposed grade (G4/G8) and of
self-service enrolment (G5) the moment either is built. Reconciliation (ADR 0019) can see the
disagreement but its only verbs are _yield_ and _detach_ — neither pushes anything.

So the shape has to be settled before anything else writes canonical data the university is
supposed to hear about. This ADR settles the shape. It ships no code.

## Decision

### The platform writes back only what the platform originated

Write-back is defined per _intent_, not per table. A domain is writable if and only if the
platform is where the act happens and the source system is where it must be recorded:

| Intent                       | Target | Origin                          |
| ---------------------------- | ------ | ------------------------------- |
| `exam_registration.create`   | SIS    | Student registers (step 43)     |
| `exam_registration.cancel`   | SIS    | Student cancels (step 43)       |
| `course_enrollment.request`  | SIS    | Self-service enrolment (**G5**) |
| `course_enrollment.withdraw` | SIS    | Self-service enrolment (**G5**) |
| `course_result.publish`      | SIS    | Grade entry (**G4**/**G8**)     |
| `learning_space.provision`   | LMS    | An offering needs a space       |
| `learning_enrollment.upsert` | LMS    | Enrolment mirrored into the LMS |

Everything else is **read-only by nature**: persons, org units, academic terms, programs,
courses, offerings, rooms, timetable events and exam terms themselves are the registry's own
records, and activities, marks, hand-ins and completions are the LMS's. StudViro holds a copy
of those and has no standing to change them. The rule is one sentence — _the platform never
writes back a row it did not originate_ — and it is what keeps write-back from becoming a
second, worse importer running backwards.

The two LMS intents are the honest exception to "originated here": the platform does not
invent the enrolment, it relays a SIS fact into a system that has no other way to learn it.
That is provisioning, and it is why `course.provision` and `enrollment.write` are already in
`LEARNING_SYSTEM_CAPABILITIES`.

### Queued through an outbox, never synchronous

A write is recorded as a row in a new `source_write_intents` table, **in the same transaction
as the canonical write**, and drained by a worker on the existing `synchronization` queue.

Writing through the connector inside the request was rejected. A university system that is
slow, down or behind maintenance would otherwise decide whether a student may register at all,
and a timeout would leave the caller unable to tell whether the registration landed on either
side. The canonical row is the platform's own fact and must not be hostage to a third party's
uptime. Transactional enqueue is what makes this safe: the intent cannot be lost after the row
is written, and it cannot exist for a row that rolled back.

The intent carries institution, target source system, connector name, intent kind, the
canonical id and table, the payload the command needs, the acting user, and its delivery
state:

```
pending → in_flight → acknowledged
                    → rejected
                    → abandoned
```

with `attempts`, `next_attempt_at`, `last_error_code`, `last_error_message`. It is
institution-scoped and soft-deletable like every other table, and like
`reconciliation_resolutions` it carries no provenance columns and no foreign key on
`canonical_id`: it is a platform record of a platform decision about a row that may since have
been tombstoned.

### The canonical row tells the truth while the write is in flight

An undelivered write is a known disagreement between the platform and the source, which is
exactly what `synchronization_status = 'pending'` already means. A row with a live intent
carries `pending`; acknowledgement returns it to `in_sync`. No new enum value, and no new
column on seven canonical tables.

This deliberately overloads the value `accept_source` writes (ADR 0019) — inbound "overwrite
me on the next run" and outbound "not yet pushed" are the same state read from two sides:
_the two systems differ and a synchronization settles it_. What distinguishes them is the
presence of a live intent row, which is a join away and is what every surface below keys on.

### Acknowledgement is what stamps provenance

A connector write returns the identifier the source assigned. On `acknowledged` the worker
stamps `source_system` and `external_id` onto the canonical row in the same transaction that
closes the intent.

This is the load-bearing part. Until the row carries the source's identifier, the next import
of that domain cannot match it, and will create a second row beside ours — the duplicate
ADR 0019 accepts for a deliberate `keep_platform` override would arrive here by accident. A
write-back that does not adopt the source's identifier is not finished.

### The intent id is the idempotency key

Each command takes the intent's UUID as an idempotency key, passed to the connector and
expected to be honoured by the source adapter. A worker that crashes between the connector
call and the acknowledgement redelivers the same key, so the source recognises the repeat
rather than registering the student twice. This is the same reasoning as
`IdempotencyInterceptor` applies to inbound requests, at the other boundary.

### A refusal is not a failure, and they are handled differently

- **`rejected`** — the source gave a business answer: no seats, window closed, not eligible,
  unknown person. Deterministic; retrying produces the same answer. The intent stops, and the
  platform **compensates**: the exam registration is cancelled, the enrolment request rejected,
  the grade returned to `proposed`. The source is the system of record, and a registration the
  university refuses is not a registration — leaving it standing would be the original lie in
  a new place. The student is notified (**G9**), and until that family exists the compensation
  is silent, which is a known and stated cost.
- **`abandoned`** — transport, timeout or 5xx, retried with exponential backoff and capped.
  After the cap the intent stops and **nothing is compensated**, because the platform does not
  know whether the write landed. It becomes a stuck write on the sync monitor for a human
  holding `sync:run` to retry or discard.

The distinction is the connector's to make: a write throws either `ConnectorRejected` (with
the source's reason) or an ordinary error. An adapter that cannot tell the difference must
report the ordinary error, because retrying is recoverable and compensating wrongly is not.

### An import that lands first does not clobber a pending write

This is the interaction the ADR exists to answer. Three cases, one rule each:

1. **The import carries a row matching our `external_id`.** The acknowledgement arrived by the
   other road. The upsert wins as it always does, and the intent — already acknowledged, or
   acknowledged by observation — closes.
2. **The import does not offer the row, and would tombstone or prune it.** It does not. A row
   with a live `pending` or `in_flight` intent is excluded from tombstoning and from child
   pruning, and counted `skipped`. The source has not seen our write yet; deleting the row for
   that reason would erase the registration the student is waiting on.
3. **The import offers a conflicting version of the row.** The stale-write guard decides as it
   always does, and the intent is unaffected — it describes an act, not a version.

Case 2 is the one new rule importers must honour, and the honest cost of this design: the
tombstone and prune steps gain a predicate they can forget. It is one predicate in
`DomainSynchronizer`, not a flag every importer carries.

### Reconciliation does not push, and does not detach a row we are still delivering

ADR 0019 stays as it is: reconciliation compares and settles inbound, and never calls a
connector. Where a discrepancy exists _because_ a write never landed, the remedy is the
outbox, not a resolution — so a row with a live intent is reported with that fact and is not
resolvable, the same shape `missing_in_platform` already has, with a detail naming the stuck
write instead of a full run.

`keep_platform` abandons any live intent for that row. Detaching asserts the row is a platform
fact; a platform fact has nothing to tell the source.

### A connector that cannot write is not a broken connector

The writable intents above are capabilities in `capabilities()`, declared exactly as reads are
— `examRegistration.write`, `courseRegistration.write`, `course.provision`, `enrollment.write`
today, plus one for result publication when G4/G8 lands. If the institution's connector does
not declare the capability, **no intent is created and the action still succeeds locally**,
with the surface saying so: _registered in StudViro; this institution's system is not notified
automatically_.

The alternative — refusing the action — would disable exam registration for every institution
whose connector is read-only, which today is all of them. A partial source produces a partial
run rather than a failed one (ADR 0010); a partial connector should produce a partial write in
the same spirit, provided it is said out loud rather than implied.

### One live intent per canonical row, and later supersedes earlier

A partial unique index allows one live intent per `(institution_id, canonical_id)`. A second
act on the same row while the first is undelivered collapses:

- the earlier intent is still `pending` → both are dropped; the source never heard of it, so
  register-then-cancel is a no-op there;
- the earlier intent is `in_flight` or `acknowledged` → the new intent is queued behind it.

Without this, a cancel can overtake its own registration and the source ends up holding a seat
nobody can see.

### No new permission

An intent is created by whoever held the permission for the canonical act — `exam:register`,
`grade:publish`, `enrollment:manage`. Write-back is the same decision reaching further, not a
second decision. The outbox is visible under `sync:read` and retried or discarded under
`sync:run`, because a stuck write is a synchronization fact and that is who already reads them.

## Consequences

- A student can be told the truth about where their registration stands, which the product
  currently cannot say at all.
- `DomainSynchronizer` gains a rule it must not forget: rows with a live intent are neither
  tombstoned nor pruned. It is the new coupling this design introduces, and it should be
  covered by a test at the synchronizer level rather than per importer.
- A rejected write silently reverses something the student did, until **G9** gives it a
  notification family. That sequencing is a real cost and the compensation should not ship far
  ahead of the message.
- `mock-sis` must implement the write commands, including a deterministic refusal, or none of
  this is walkable. The mock is the only place a `rejected` path can be exercised at all.
- Nothing is undoable: an acknowledged write is at the source, and taking it back is another
  intent, not an undo.
- The outbox is a new operational surface — a queue that can be stuck and an administrator who
  must notice. It belongs on the sync monitor beside the runs, not on a page of its own.
- This is designed against `mock-sis`. A real AIS2 or Moodle adapter may have no write API at
  all for some of these intents, which the capability map already expresses — the design
  degrades to "not notified automatically" rather than breaking.

## Implementation, in order

The ADR lands alone. The build is at least three steps:

1. `source_write_intents`, the worker, the capability gate, the importer predicate and the
   monitor surface, delivering `exam_registration.create` / `.cancel` against a `mock-sis`
   that implements both — the whole loop end to end on one intent kind.
2. The LMS pair, `learning_space.provision` and `learning_enrollment.upsert`, which is where
   provisioning stops being a column nobody writes (`enrollments.lms_provisioned_at`).
3. `course_result.publish`, after G4/G8 give grades a writer at all, and after the exam
   lifecycle work (B4/B5/B9/B11) settles what a result even is on a retake.
