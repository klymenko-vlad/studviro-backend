# Feature Status

What a user can actually do in StudViro today, by audience. This is the product view;
`docs/Task Tracker.md` is the delivery view over the 71-step backlog and
`docs/STATUS.md` is the handoff note. Update the affected row in the same commit as the
work, per the `ship-backlog-step` skill.

Last updated: 2026-09-11

## States

| State      | Meaning                                                               |
| ---------- | --------------------------------------------------------------------- |
| `Live`     | Usable end to end by its audience: API, screen, tests, strings keyed  |
| `Partial`  | Usable, but a named part of the capability is missing                 |
| `API only` | The endpoint works; no screen sits behind it, so nobody can use it    |
| `Planned`  | Not started                                                           |
| `Blocked`  | Waiting on access, credentials or a decision outside the repositories |

## Everyone

| Feature                      | Backend | Frontend | State     | Notes                                                                                                                           |
| ---------------------------- | ------- | -------- | --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Create an account            | ✅      | ✅       | `Live`    | `/sign-up`; registration signs you in and lands on `/account`                                                                   |
| Sign in with a password      | ✅      | ✅       | `Live`    | argon2, 15-min access JWT, rotating refresh token, reuse detection                                                              |
| Find my way around the app   | —       | ✅       | `Live`    | Header on every page; per-institution nav gated on the server's permission answer                                               |
| Sign in with a university ID | ⬜      | ⬜       | `Blocked` | OIDC strategy blocked on institutional client registration                                                                      |
| See my roles and identities  | ✅      | ✅       | `Live`    | `/account`                                                                                                                      |
| Link an external account     | ✅      | ✅       | `Partial` | A shared email raises `IDENTITY_EMAIL_CONFLICT` and must be linked deliberately                                                 |
| Ukrainian and English UI     | —       | ✅       | `Partial` | `NEXT_LOCALE` cookie, no locale route segment; strings are keyed as they are built but Ukrainian translation is a deferred pass |
| Accessible interface (AA)    | —       | ⬜       | `Planned` | Step 52; no audit pass yet                                                                                                      |
| Search my data               | ⬜      | ⬜       | `Planned` | Step 51                                                                                                                         |
| Export my personal data      | ⬜      | ⬜       | `Planned` | Step 50                                                                                                                         |

## Student

| Feature                  | Backend | Frontend | State     | Notes                                                                                                                                                |
| ------------------------ | ------- | -------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unified dashboard        | —       | ✅       | `Live`    | `/institutions/[id]`; current-term courses, results and the rest of this week, each linking through                                                  |
| My courses               | ✅      | ✅       | `Live`    | `/institutions/[id]/courses`; enrolments by term                                                                                                     |
| Unified calendar         | ✅      | ✅       | `Live`    | `/institutions/[id]/calendar`; the week's classes and its exam terms as two layers, filterable by course and type, plus a dashboard tile             |
| Course 360° page         | ✅      | ✅       | `Live`    | `/institutions/[id]/courses/[offeringId]`; staff, own enrolment, study groups                                                                        |
| Grades with provenance   | ✅      | ✅       | `Live`    | `/institutions/[id]/grades` and each course page; calculated, proposed and official values plus source and sync state                                |
| Exam terms               | ✅      | ✅       | `Live`    | `/institutions/[id]/exams` and each course page; filterable by course, kind and whether you may act on it, with seats, window and examiner           |
| Exam registration        | ✅      | ✅       | `Live`    | Register and cancel from any exam term card; the server says whether you may and why not — a closed window, a full room, a seat held on another term |
| Aggregated notifications | ✅      | ✅       | `Partial` | `/institutions/[id]/notifications`; exam terms published, moved or cancelled reach enrolled students once per day per term. Nothing else emits yet   |

## Teacher

| Feature                 | Backend | Frontend | State     | Notes                                                                                                                              |
| ----------------------- | ------- | -------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| My teaching             | ✅      | ✅       | `Live`    | `/institutions/[id]/teaching`; the offerings you lead, by term, with your teaching role and how many students are enrolled         |
| Course roster           | ✅      | ✅       | `Live`    | Roster panel on each course page; student, enrolment status, study groups and enrolment date, to whoever teaches or administers it |
| Enter or propose grades | ⬜      | ⬜       | `Planned` | `grade:propose` exists but nothing writes a result yet                                                                             |

## Administrator

| Feature                              | Backend | Frontend | State     | Notes                                                                        |
| ------------------------------------ | ------- | -------- | --------- | ---------------------------------------------------------------------------- |
| Grant and revoke scoped roles        | ✅      | ✅       | `Live`    | `/institutions/[id]/roles`; permissions, scope hierarchy, `PermissionsGuard` |
| Find a person or scope for a grant   | ⬜      | ⬜       | `Planned` | Grants name subject and scope by identifier; no directory or org-unit read   |
| Institution settings and terminology | ✅      | ✅       | `Live`    | `/institutions/[id]/settings`; terminology overrides are label-only          |
| Feature flags per institution        | ✅      | ✅       | `Live`    | Resolved against platform defaults; read from the database on every call     |
| Choose a connector, see its health   | ✅      | ✅       | `Live`    | Selection, health and capabilities on `/institutions/[id]/settings`          |
| Store connector credentials          | ✅      | ✅       | `Live`    | Declared fields per connector, encrypted at rest, never read back            |
| Map connector fields                 | ⬜      | ⬜       | `Planned` | No field mapping; a connector takes the shape the importer expects           |
| Trigger and inspect a sync run       | ✅      | ✅       | `Live`    | `/institutions/[id]/sync`; freshness, per-domain results, run history, retry |
| Schedule syncs                       | ⬜      | ⬜       | `Planned` | Every run is hand-triggered today                                            |
| Resolve mapping conflicts            | ⬜      | ⬜       | `Planned` | Steps 37, 48                                                                 |
| Read audit events                    | ⬜      | ⬜       | `Planned` | Step 49                                                                      |

## Platform

| Capability                      | State     | Notes                                                                                        |
| ------------------------------- | --------- | -------------------------------------------------------------------------------------------- |
| Canonical academic model        | `Live`    | 25 tables, institution-scoped, full provenance, external IDs never primary keys              |
| Mock SIS connector              | `Live`    | Deterministic, ~5k linked records from a seed, honours `changedSince`                        |
| Synchronization engine          | `Partial` | Imports the SIS into canonical tables; enrolments, offerings and course results are readable |
| Retries, tombstones, watermarks | `Live`    | Stale-write guard, per-domain watermarks, child pruning, per-record failures                 |
| Reconciliation checks           | `Planned` | Step 37                                                                                      |
| Moodle connector                | `Planned` | `LearningSystemConnector` interface exists; no implementation, no dev instance               |
| AIS2 connector                  | `Blocked` | Blocked on documented institutional access (step 15)                                         |
| Generated API contract          | `Live`    | `openapi.json` drift-checked; the client is generated from it                                |
| Observability                   | `Partial` | Pino, health, Prometheus; sync freshness readable over the API, not a metric                 |
| Containerized deployment        | `Partial` | Backend Dockerfile and compose ship; the client's deployment does not                        |
| Backup and restore              | `Planned` | Step 55                                                                                      |
| End-to-end and security tests   | `Planned` | Steps 59–62; unit and domain tests are continuous                                            |
