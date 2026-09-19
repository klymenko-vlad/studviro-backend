# Product Plan

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

| #   | Step                                                                | Carries over |
| --- | ------------------------------------------------------------------- | ------------ |
| N1  | Academic terms: create, edit, set the enrolment window              | —            |
| N2  | Org units and rooms: create and edit                                | —            |
| N3  | Course offerings: create (`PATCH` already exists), schedule, retire | —            |
| N4  | Teaching assignments: make somebody a course's teacher              | —            |
| N5  | Programme memberships: make somebody a student of a programme       | —            |
| N6  | Study groups and their membership                                   | —            |
| N7  | Timetable events: create, move, cancel — closes `schedule:manage`   | step 39      |
| N8  | Exam terms: create, move, cancel, set capacity and window           | step 43      |
| N9  | Bulk entry: paste or upload a term's worth of offerings and people  | step 63      |

## Phase 2 — The learning half, natively

The Moodle replacement. This is the larger half and it needs storage the platform does not
have yet.

| #   | Step                                                                        | Carries over |
| --- | --------------------------------------------------------------------------- | ------------ |
| L1  | File storage: object store, upload limits, virus posture, signed reads      | —            |
| L2  | Learning spaces authored per offering, not derived                          | step 32      |
| L3  | Materials: files, links, text, ordering, visibility                         | step 33      |
| L4  | Assignments: brief, open/due dates, attempt policy                          | step 33      |
| L5  | Student submissions: upload, resubmit, late marking                         | step 33      |
| L6  | Marking: per-submission feedback, rubric-free first, into the working grade | step 41      |
| L7  | Quizzes — decide explicitly whether this is in scope at all                 | —            |

## Phase 3 — What the two systems never did well

The reason to replace rather than tolerate them.

| #   | Step                                                                | Carries over |
| --- | ------------------------------------------------------------------- | ------------ |
| U1  | One timeline: classes, deadlines and exams already share a calendar | step 39 ✅   |
| U2  | Study progress against the programme, not just a grade list         | step 42      |
| U3  | Search across everything the caller may see                         | step 51      |
| U4  | WCAG 2.2 AA pass                                                    | step 52      |
| U5  | Mobile-first review of every screen                                 | step 21      |
| U6  | Terminology overrides rendered everywhere (rest of B7)              | step 28      |

## Phase 4 — Fit to run

| #   | Step                                          | Carries over |
| --- | --------------------------------------------- | ------------ |
| O1  | GDPR data inventory and DPIA                  | step 19      |
| O2  | Threat model                                  | step 20      |
| O3  | Structured audit events                       | step 49      |
| O4  | Personal-data export and erasure              | step 50      |
| O5  | Metrics and freshness observability           | step 53      |
| O6  | Backup and restore, proven by a restore drill | step 55      |
| O7  | Authorization-negative and security tests     | step 60      |
| O8  | Performance and load tests                    | step 61      |
| O9  | Accessibility tests                           | step 62      |
| O10 | Administrator and user documentation          | steps 68, 69 |

## Void

Steps 5, 7, 10, 12, 13, 14, 16, 29, 31, 32, 33, 34, 35, 36, 37, 46, 57, 58 and 64 assumed an
integration. Steps 4 and 5 survive with a new purpose: what AIS2 and Moodle do is the feature
checklist a replacement must meet.

Step 6 (validate with real users), 15 (AIS2 access) and 65 (usability evaluation) stay
blocked on people outside this project.
