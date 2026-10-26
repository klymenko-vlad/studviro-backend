# Product Plan

**Phases 0 to 4 are done**, thirty-three items, both halves of each, and are the record of
what was built and why. **Phase 5 is the live queue.**

The backlog, rewritten for what StudViro is: **one academic platform that does the job AIS2
and Moodle do between them, entered and owned by the institution itself.** ADR 0024 records
why, and what the old plan assumed instead.

`Tasks Plan.md` is superseded. It is research output written against an integration premise
and is kept for the record; where a step there still describes something worth building it is
carried forward below, by number, so nothing is silently dropped.

## What this replaces

A student's and a teacher's year, end to end, in one place:

| AIS2 does                              | Moodle does                       | StudViro does both |
| -------------------------------------- | --------------------------------- | ------------------ |
| Programmes, courses, terms, timetables | Course spaces and materials       | One catalogue      |
| Enrolment and its administration       | Course membership                 | One enrolment      |
| Exam terms, registration, credits      | Assignments, submissions, marking | One record         |
| The official grade                     | The working grade                 | One grade, staged  |

## Phase 0 — Remove the integration (ADR 0024)

**Done.** R1–R5 and R7 landed in `9d28d63` (backend) and `d4460eb` (client); R6 followed.

| #   | Step                                                                          | Status |
| --- | ----------------------------------------------------------------------------- | ------ |
| R1  | Delete `modules/connectors`, `modules/synchronization`, `modules/write-back`  | Done   |
| R2  | Delete the sync monitor, connector status, reconciliation and write-intent UI | Done   |
| R3  | Drop the five integration tables and `connector_credentials`                  | Done   |
| R4  | Strip `provenance` from 8 schema files; 6 columns off 25 tables               | Done   |
| R5  | Remove `sync:read`, `sync:run`, `connector:configure` from the catalogue      | Done   |
| R6  | Repurpose the `mock-sis` generator as the demo seed, writing canonical rows   | Done   |
| R7  | Rewrite the marketing copy that claims integration                            | Done   |

`pnpm db:seed` now writes a whole demo university — ~5,900 canonical rows across fifteen
tables — from the recovered `mock-sis` generator, rewritten to write rows instead of
`ConnectorRecord`s. It lives in `src/database/demo-seed/` and ADR 0025 records what it is
for and why re-running it replaces the demo rather than merging into it.

## Phase 1 — The registry an institution can actually run

Everything below previously arrived only by import. Without it, a fresh institution cannot be
set up at all.

| #   | Step                                                                | Carries over | Status   |
| --- | ------------------------------------------------------------------- | ------------ | -------- |
| N1  | Academic terms: create, edit, set the enrolment window              | —            | **Done** |
| N2  | Org units and rooms: create and edit                                | —            | **Done** |
| N3  | Course offerings: create (`PATCH` already exists), schedule, retire | —            | **Done** |
| N4  | Teaching assignments: make somebody a course's teacher              | —            | **Done** |
| N5  | Programme memberships: make somebody a student of a programme       | —            | **Done** |
| N6  | Study groups and their membership                                   | —            | **Done** |
| N7  | Timetable events: create, move, cancel — closes `schedule:manage`   | step 39      | **Done** |
| N8  | Exam terms: create, move, cancel, set capacity and window           | step 43      | **Done** |
| N9  | Bulk entry: paste or upload a term's worth of offerings and people  | step 63      | **Done** |

## Phase 2 — The learning half, natively

**Done.** The Moodle replacement: an S3-compatible store (ADR 0027), learning spaces
authored per offering, materials as files, links or text, assignments with a window and an
attempt policy, student submissions, and marking that feeds the gradebook column every
assignment creates with itself. ADR 0028 records the model and why quizzes are out.

| #   | Step                                                                        | Carries over | Status   |
| --- | --------------------------------------------------------------------------- | ------------ | -------- |
| L1  | File storage: object store, upload limits, virus posture, signed reads      | —            | **Done** |
| L2  | Learning spaces authored per offering, not derived                          | step 32      | **Done** |
| L3  | Materials: files, links, text, ordering, visibility                         | step 33      | **Done** |
| L4  | Assignments: brief, open/due dates, attempt policy                          | step 33      | **Done** |
| L5  | Student submissions: upload, resubmit, late marking                         | step 33      | **Done** |
| L6  | Marking: per-submission feedback, rubric-free first, into the working grade | step 41      | **Done** |
| L7  | Quizzes — decided: out of scope, ADR 0028                                   | —            | **Done** |

## Phase 3 — What the two systems never did well

The reason to replace rather than tolerate them.

| #   | Step                                                                | Carries over | Status   |
| --- | ------------------------------------------------------------------- | ------------ | -------- |
| U1  | One timeline: classes, deadlines and exams already share a calendar | step 39 ✅   | **Done** |
| U2  | Study progress against the programme, not just a grade list         | step 42      | **Done** |
| U3  | Search across everything the caller may see                         | step 51      | **Done** |
| U4  | WCAG 2.2 AA pass                                                    | step 52      | **Done** |
| U5  | Mobile-first review of every screen                                 | step 21      | **Done** |
| U6  | Terminology overrides rendered everywhere (rest of B7)              | step 28      | **Done** |

**U4, U5 and O9 landed together**, frontend only, and are written up in
`frontend/docs/Accessibility.md` — every criterion checked, every measured contrast ratio in
both themes, what was fixed at the primitive level and what was deliberately deferred. In
short: a skip link and `id="main-content"` on every screen; `CardTitle` and the card headings
made real headings; `--input` raised to 3:1 in both themes and light-mode `--success` to
4.5:1; `color-scheme` and `theme-color` declared; the `Table` primitive given a required
caption, a keyboard-reachable named scroll region and a visible scroll affordance, which is
also the answer to the five-column table on a 375 px phone; `Switch` given a 24 px target;
`Skeleton` made a named live region. `vitest-axe` with a `renderAndAudit` helper in
`@/shared/test` asserts no violations on a screen of each shape.

## Phase 4 — Fit to run

| #   | Step                                          | Carries over | Status   |
| --- | --------------------------------------------- | ------------ | -------- |
| O1  | GDPR data inventory and DPIA                  | step 19      | **Done** |
| O2  | Threat model                                  | step 20      | **Done** |
| O3  | Structured audit events                       | step 49      | **Done** |
| O4  | Personal-data export and erasure              | step 50      | **Done** |
| O5  | Metrics and operational liveness              | step 53      | **Done** |
| O6  | Backup and restore, proven by a restore drill | step 55      | **Done** |
| O7  | Authorization-negative and security tests     | step 60      | **Done** |
| O8  | Performance and load tests                    | step 61      | **Done** |
| O9  | Accessibility tests                           | step 62      | **Done** |
| O10 | Administrator and user documentation          | steps 68, 69 | **Done** |

**O4 is `src/modules/privacy/`**, built to ADR 0030. `GET /institutions/:institutionId/me/personal-data`
answers Article 15 for the caller and nobody else — account, sign-in trail, roles,
invitations, programme memberships, enrolments, results, exam registrations, study groups,
assessment results, activity completions, submissions, notifications and the storage keys
of their files. `DELETE /institutions/:institutionId/people/:userId/personal-data`, behind
`institution:manage`, anonymises the person and keeps the record: the address becomes an
unroutable placeholder, the digest is nulled, `token_version` is bumped, credentials and
invitations are **hard-deleted** — `BaseRepository.hardDelete`'s first callers outside
token purging — free text about the person is cleared, submitted files are deleted from the
object store, and an `audit_events` row is filed under the erasure's own id so the trail
carries no identifier of the person it records. Refused while another institution still has
an active relationship, naming the fact and not the institution. The screen is outstanding.

**O8 is `load-test/university-day.js`** and `docs/Performance.md`. The profile models the
load a university actually makes — spiky and correlated — as three overlapping scenarios:
a results evening of sign-in and reads, an enrolment rush of 144 students on 40 places,
and an exam-registration rush on 25 seats. Its thresholds are `docs/Observability.md`'s
alert thresholds, so the run fails rather than merely reporting. Measured on 2026-09-19:
19,330 requests at 69.6/s, p95 131 ms, zero 5xx, both rushes filled exactly and never
oversold. **It bends at the enrolment write**: a quarter of the herd gets
`409 SERIALIZATION_FAILURE` and nothing retries it, and raising `DATABASE_POOL_MAX` from
10 to 40 makes that 80% and leaves 12 of 40 places unsold. A bounded retry around
`MyEnrollmentsService.request` is the fix and is a behaviour change, so it is a step of
its own rather than part of a measurement.

**O10 is `docs/Administrator Guide.md` and `docs/User Guide.md`.** The first walks an
institution from nothing to a running term in the order the screens require, then covers
the ongoing jobs, naming the permission and the screen for each. The second is two short
audiences, student and teacher. Both end with what is deliberately absent, so nobody
hunts for a screen that is not there.

**O1 and O2 are as complete as this repository can make them.** `GDPR Data Inventory.md`,
`DPIA.md` and `Threat Model.md` are written from the code, field by field and boundary by
boundary. What is left in them is a table at the top of each headed _What the institution
must supply_ — the controller's identity, the DPO, retention periods, the lawful basis per
purpose, the hosting provider's controls. Those are not knowable from source and were
deliberately marked `TODO(institution)` rather than invented.

**O5 was renamed.** "Freshness" meant lag behind the upstream system, and ADR 0024 removed
the upstream: on a system of record there is nothing to be stale relative to. It is now
operational liveness — queue lag, the age of the oldest waiting job, migration drift —
measured and documented in `docs/Observability.md`.

## Phase 5 — What the thesis review found (2026-10-26)

**Open; W1 done (ADR 0054).** The diploma was checked against its zadanie and against what AIS2 does on
2026-10-26, and the student chose this order. Take the next open step, one step per session, both
halves of each; the items under _Later_ are recorded so nothing is lost, not scheduled.

| #   | Step                                                                                                                                                                                                                            | Status |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| W1  | Personal planner: a student's own tasks (with a due time) and events, private to them, shown in the calendar, on the dashboard and in the iCalendar feed                                                                        | Done   |
| W2  | B43 — a teacher reads another course's learning space through the API                                                                                                                                                           | Open   |
| W3  | B48 — withdrawing a graded student erases their published grade                                                                                                                                                                 | Open   |
| W4  | B49 — a sat exam loses its registration and its seat count                                                                                                                                                                      | Open   |
| W5  | Course announcements: a teacher writes to all students of an offering, a group or selected students; in-app plus e-mail (important ones always mailed, Reply-To the teacher), kept on the course page, rate-limited and audited | Open   |
| W6  | Zápisný list: the year's enrolled courses and credits as a PDF                                                                                                                                                                  | Open   |
| W7  | Confirmation of study (potvrdenie o štúdiu) as a PDF with a code anyone can verify on a public page                                                                                                                             | Open   |
| W8  | Transcript (výpis výsledkov) as a PDF, by term                                                                                                                                                                                  | Open   |
| W9  | One-click subscribe (Google, Outlook, Apple / `webcal://`) and _Add to calendar_ on a single exam, deadline or class                                                                                                            | Open   |
| W10 | A better feed: choose classes / exams / deadlines, reminders (`VALARM`), course codes and links back                                                                                                                            | Open   |
| W11 | Deadline reminders: a notification and optional e-mail before a deadline or exam, set in account settings                                                                                                                       | Open   |

**Later**, in rough order of value:

- weekly workload view; grade forecast from the gradebook weights; a meeting link on a class
  or exam; installable app with push notifications;
- a personal document store; a request workflow (žiadosti) for the study office, then
  scholarships on top of it (applications, awards, IBAN — sensitive data, GDPR inventory
  first); fees with a PAY by square QR code; thesis registration; a course evaluation survey;
- two-way sync with Google Calendar / Microsoft Graph and attaching submissions from Google
  Drive / OneDrive — both need OAuth credentials and hosted resources, against the
  local-only standing decision;
- the open tracker rows not above: B34, B35 (needs a product answer), B36, B39, B40, B41
  (U1 of `UI Work Plan.md`), B42, B46, B51, B52; discussion that updates without a reload;
  _Account_ and _Account settings_ as one menu entry.

## Void

Steps 5, 7, 10, 12, 13, 14, 16, 29, 31, 32, 33, 34, 35, 36, 37, 46, 57, 58 and 64 assumed an
integration. Steps 4 and 5 survive with a new purpose: what AIS2 and Moodle do is the feature
checklist a replacement must meet.

Step 6 (validate with real users), 15 (AIS2 access) and 65 (usability evaluation) stay
blocked on people outside this project.
