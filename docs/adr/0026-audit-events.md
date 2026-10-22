# 0026 — Audit events are written in the transaction they describe

Status: accepted
Date: 2026-09-19

## Context

The threat model (O2) and the DPIA (O1) were written a day apart and both name the same
finding first: **there is no audit log at all.**

A grade correction, a role grant, an enrolment override and a term cancellation each leave
nothing behind but the row's final state. `official_course_results` carries
`official_recorded_by_id` and `official_recorded_at`, so the last publisher of the current
grade is known — but the grade that was replaced is gone, and a second correction erases
the first publisher too. `role_assignments` is soft-deleted, so a revoked role is at least
still readable; who revoked it is not recorded anywhere. An enrolment corrected by a
registrar is indistinguishable from one the student made themselves.

StudViro is now the system of record (ADR 0024). There is no upstream system holding a
second copy of any of this, and no import job whose log could be read as a substitute. If
a student disputes a mark, the institution has the mark and nothing else.

## Decision

**One append-only `audit_events` table, institution-scoped like every other canonical
table, written inside the transaction of the action it describes.**

A row carries the institution, the actor (nullable — a job, a cascade or the clock has
none), a dotted action name such as `grade.published`, the subject as a type and an id,
a one-line human summary, `before` and `after` as `jsonb`, the request id, and
`occurred_at`. It is indexed for the two reads a screen actually does: by institution and
time, and by subject.

### Written in the same transaction

`AuditService.record` writes through `TransactionHost.client()`, which joins whatever
transaction the audited write opened. The action and its record therefore commit together
or roll back together.

The alternative — `withoutTransaction`, which the transaction context already offers, or a
queued job — buys durability of the record when the action itself fails, and pays for it
with a log that claims things that never happened. A log that over-reports is worse than
one that under-reports: an event with no matching row cannot be told apart from a row that
was later deleted, and the whole value of the record is that it can be believed. A write
that never committed is not a fact about the institution.

The cost is accepted and named: an actor who can roll back the transaction can prevent the
record, and a database failure loses both. Both are acceptable against tamper-evidence of
committed facts, which is what a registrar disputing a grade needs.

### Append-only in spirit, not enforced in the database

The table has no `deleted_at` and nothing in the application updates a row, which is why it
deliberately sits outside `BaseRepository` — that class's entire contract is mutation. It is
not `REVOKE`d at the role level and there is no trigger forbidding `UPDATE`; the application
connects as the owner, so a database-level guarantee would need a second role and is a
deployment change rather than a code one. Recorded here as a known gap, not as a decision
against it.

## What is audited

| Action                 | Subject           | Before                               |
| ---------------------- | ----------------- | ------------------------------------ |
| `grade.proposed`       | `course_result`   | the attempt's previous stage, if any |
| `grade.published`      | `course_result`   | the attempt's previous stage, if any |
| `role.granted`         | `role_assignment` | null — nothing stood before it       |
| `role.revoked`         | `role_assignment` | the assignment as it stood           |
| `enrollment.corrected` | `enrollment`      | the status the registrar replaced    |
| `exam_term.cancelled`  | `exam_term`       | the seats the term was holding       |

One call that both proposes and publishes writes **one** event, `grade.published`: the
consequential act is the publication, and the proposal it carried is visible in the same
row's `after`. Two events for one decision would make "how many times was this grade
touched" unanswerable.

## What is deliberately not audited

- **Reads.** Every authenticated request reads something; logging them would multiply the
  table by three orders of magnitude and bury the six actions that matter. Access logging
  is a different feature with different retention, and the correlation logs already carry
  the request.
- **Self-service.** A student enrolling, withdrawing, or registering for an exam term is
  not an intervention in somebody else's record; the enrolment row's own timestamps say
  what happened. The registrar's _correction_ of the same row is audited, because that is
  one person acting on another's record.
- **The catalogue.** Creating a course, an offering or a term is ordinary data entry, and
  the rows are soft-deleted rather than erased. It is a candidate, not an omission on
  principle.
- **Authentication.** Sign-in, refresh and password reset already have their own tables
  and their own retention; duplicating them here would put credentials-adjacent events
  under a permission granted to institution administrators.

## Consequences

- `audit:read` joins the permission catalogue and is granted to `institution_admin`
  alone. A registrar and an org unit manager both administer people and cannot read the
  log of their own actions.
- `GET /institutions/:institutionId/audit-events` is keyset-paginated over
  `(occurred_at, id)` and narrows by action, subject and actor. There is no screen yet;
  the endpoint exists so one can be built and so the data can be produced on request.
- Request ids reach the service layer through an `AsyncLocalStorage` filled by a Fastify
  `onRequest` hook, rather than through a parameter threaded down every call site.
- `ExamTermCancellationService.releaseSeats` now takes the institution and, optionally, the
  actor. It had no caller — nothing cancels an exam term yet (N8) — so the signature was
  free to change and the audit row is ready when the caller arrives.
- Retention is not yet decided and is marked `TODO(institution)` in the DPIA alongside the
  other placeholders. Nothing prunes the table.
