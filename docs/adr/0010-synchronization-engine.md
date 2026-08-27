# 0010 — Synchronization engine and job state machine

Status: accepted
Date: 2026-08-15

## Context

The canonical schema (ADR 0009) and the connector interfaces exist, and `mock-sis` produces a
full synthetic university, but nothing moved records from a source into the canonical tables.
Every product surface — dashboard, calendar, course page, grades — reads canonical rows, so
the import is the gate on all of them.

An import against a university system is not a one-shot script. It runs repeatedly, over a
source that changes underneath it, through a network that fails halfway; and it must be safe
to run twice.

## Decision

A run is a row. `sync_runs` carries one import attempt against one institution's academic
connector (`queued → running → succeeded | partial | failed`), `sync_domain_results` carries
what each domain did within it, and `sync_watermarks` carries how far each domain has read.
Operations questions — what ran, what broke, how stale is this — are answered by querying
tables rather than by reading logs.

### Domains, not tables

The unit of work is a connector method: `persons`, `orgUnits`, `courseOfferings` and so on.
Each has one importer that fetches its records and maps them onto canonical rows, and each is
skipped when the connector's `capabilities()` map says the source cannot serve it — a partial
source produces a partial run, not a failed one.

Importers run in a fixed order, and the order is the dependency order: a domain may only
reference rows an earlier domain has already written. Resolution goes through the external
id, never through a name, and a required reference that does not resolve fails that record
rather than writing a row with a dangling or invented parent.

### Idempotence lives in the upsert, not in the caller

Every write is an upsert on `(institution_id, source_system, external_id)` with
`source_updated_at <= excluded.source_updated_at` as the update predicate. Re-importing an
unchanged record is a no-op, and a record that arrives out of order cannot overwrite a newer
one. A record the source marks deleted soft-deletes its canonical row; child collections
(teaching assignments, study-group members) are pruned to what the parent record still lists,
so a removal at the source does not linger as a live row here.

Persons are the exception, because a person becomes a platform `user` plus an
`ExternalIdentity`. The identity is keyed by `(institution, issuer, subject)` exactly as in
step 26, and a source person whose email already belongs to another platform account is
rejected as `IDENTITY_EMAIL_CONFLICT` rather than silently adopted.

### A failed record holds its own watermark back

The watermark advances to the newest `source_updated_at` a domain applied — but only if every
record applied. One failure leaves the watermark where it was, so the next run is offered the
same window again. The alternative, advancing past a failure, silently drops records and the
loss is invisible until someone notices missing data months later.

### One run at a time per institution

Runs are BullMQ jobs on a `synchronization` queue and take the Redis lock keyed by
institution; a second run finds the lock held and throws, which is a retry rather than a
concurrent import. Requesting a run while one is queued or running returns the existing run
instead of creating a second. A crashed worker leaves a run `running`, which a retry may pick
up: domain results are upserted per `(run, domain)` so a resumed run corrects its own record.

## Consequences

- Per-record writes, not bulk statements: a bad record is counted and reported, and the rest
  of the domain still lands. A full import of the shipped mock dataset is therefore thousands
  of round trips — acceptable for this scale, and the place to look first if it stops being.
- `synchronization_status` on canonical rows is still only ever `in_sync`. Reconciliation
  (step 37) is what will write `conflict`, and it has the run history to compare against.
- Nothing schedules runs yet; they are triggered through the API by a caller holding
  `sync:run`.
- The LMS side is unimplemented, but the shape is the same: a second set of importers over
  `LearningSystemConnector` writing `source_system = 'lms'`, with its own watermarks.
