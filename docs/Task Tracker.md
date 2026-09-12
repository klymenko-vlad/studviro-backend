# Task Tracker

The live checklist for the 71-step backlog in `docs/Tasks Plan.md`. That document is the
research plan and does not change; this one records what is actually built. Update it in the
same commit as the work it describes.

Last updated: 2026-09-12 (gap review)

## Working agreement

These rules apply to any work taken from this backlog. They are not general repository
conventions — for those see `AGENTS.md`.

**Features ship end to end.** A step is `Done` only when both halves are built, tested and
merged: the backend in this repository and the user-facing half in the client
(`../frontend`, Next.js App Router, Feature-Sliced Design). A step whose API exists but has
no screen behind it stays `In progress` with `Backend` ticked and `Frontend` empty. Steps
that are pure design, infrastructure or documentation carry `—` in both columns.

Shipping the backend half of a feature includes regenerating `openapi.json`, because the
client's API layer is generated from it.

**Branching.** All work lands on `dev`, in this repository and in the client. Branch from
`dev`, keep commits Conventional-Commit formatted (each repository's `commitlint.config.mjs`
fixes the allowed scopes), and merge or push back to `dev`. Never push to `main` — `main`
moves only through a release merge from `dev`.

**Committing.** Once `pnpm verify` is green, commit and push the work to `dev` without
waiting to be asked. Do not add AI co-authors. Update this tracker and `docs/STATUS.md` in
the same commit whenever the picture they describe has changed.

## Status vocabulary

| Status        | Meaning                                                                        |
| ------------- | ------------------------------------------------------------------------------ |
| `Done`        | Complete on every side the step needs, tests included                          |
| `In progress` | Started; one side or one substantive part is missing                           |
| `Blocked`     | Waiting on something outside the repository (institutional access, a decision) |
| `Not started` | No work yet                                                                    |

## Steps

### Scope and research (1–22)

| #   | Task                                                   | Backend | Frontend | Status                                                                 |
| --- | ------------------------------------------------------ | ------- | -------- | ---------------------------------------------------------------------- |
| 1   | Freeze thesis problem statement and research questions | —       | —        | Done                                                                   |
| 2   | Explicit in-scope / out-of-scope list                  | —       | —        | Done                                                                   |
| 3   | Inventory actors and stakeholders                      | —       | —        | In progress                                                            |
| 4   | Catalogue AIS2 functions                               | —       | —        | Done                                                                   |
| 5   | Catalogue Moodle functionality and APIs                | —       | —        | Done                                                                   |
| 6   | Validate workflows with real university users          | —       | —        | Blocked                                                                |
| 7   | AIS2 ↔ Moodle ↔ unified feature mapping                | —       | —        | Done                                                                   |
| 8   | Classify features P0–P3                                | —       | —        | Done                                                                   |
| 9   | Define user journeys                                   | —       | —        | In progress                                                            |
| 10  | Source-of-truth matrix per shared entity               | —       | —        | Done                                                                   |
| 11  | Canonical domain model                                 | —       | —        | Done                                                                   |
| 12  | External-ID and provenance model                       | —       | —        | Done                                                                   |
| 13  | Generic `AcademicSystemConnector` interface            | ✅      | —        | Done — interface, capability model and records in `modules/connectors` |
| 14  | Generic `LearningSystemConnector` interface            | ✅      | —        | In progress — interface and records exist; no implementation yet       |
| 15  | Document available AIS2 access                         | —       | —        | Blocked                                                                |
| 16  | Synchronization semantics                              | —       | —        | Done — ADR 0010                                                        |
| 17  | Authentication strategy and development IdP            | —       | —        | Done                                                                   |
| 18  | Canonical RBAC / scoping model                         | —       | —        | Done                                                                   |
| 19  | GDPR data inventory and DPIA screening                 | —       | —        | Not started                                                            |
| 20  | Threat model                                           | —       | —        | Not started                                                            |
| 21  | Information architecture and wireframes                | —       | —        | In progress                                                            |
| 22  | Usability review of wireframes                         | —       | —        | Not started                                                            |

### Platform foundation (23–31)

| #   | Task                                                  | Backend | Frontend | Status                                                                                                                                  |
| --- | ----------------------------------------------------- | ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 23  | Select technical stack                                | —       | —        | Done                                                                                                                                    |
| 24  | Repository structure, tooling, CI                     | ✅      | ✅       | Done                                                                                                                                    |
| 25  | Migration infrastructure and canonical schema         | ✅      | —        | Done                                                                                                                                    |
| 26  | Authentication and identity linking                   | ✅      | ✅       | In progress — credentials, `ExternalIdentity` linking and the linked-accounts screen ship; OIDC strategy blocked on client registration |
| 27  | Server-side authorization and scoped roles            | ✅      | ✅       | Done — permissions, scope hierarchy, `PermissionsGuard`, the role assignment API and the administrator's grant and revoke screens       |
| 28  | Institution configuration, terminology, feature flags | ✅      | ✅       | Done — `institution_settings`, a resolving service, the configuration API and the institution settings screen                           |
| 29  | Synthetic / mock SIS connector                        | ✅      | ✅       | Done — deterministic `mock-sis` connector, a registry, and connector health and capabilities on the settings screen                     |
| 30  | Realistic synthetic university dataset                | ✅      | —        | Done — the mock SIS generates one and the synchronization engine imports it into the canonical tables                                   |
| 31  | Moodle development instance                           | —       | —        | Not started                                                                                                                             |

### Integration (32–37)

| #   | Task                                              | Backend | Frontend | Status                                                                                                                                |
| --- | ------------------------------------------------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 32  | Moodle identity / course / enrolment reads        | ⬜      | —        | Not started                                                                                                                           |
| 33  | Moodle activities, deadlines, completion, grades  | ⬜      | —        | Not started                                                                                                                           |
| 34  | AIS2 connector                                    | ⬜      | —        | Blocked on step 15                                                                                                                    |
| 35  | Synchronization engine and job state machine      | ✅      | ✅       | Done — engine, run state machine, watermarks and the run API ship, with the monitoring screen delivered by step 47                    |
| 36  | Retries, idempotency, change tracking, tombstones | ✅      | —        | Done — provenance upsert with a stale-write guard, per-domain watermarks, tombstones, child pruning and per-record failure accounting |
| 37  | Reconciliation checks                             | ✅      | ⬜       | **In progress — the backend is written but uncommitted on `dev`** (gap G11); the screen is step 48                                    |

### Product surfaces (38–52)

| #   | Task                                        | Backend | Frontend | Status                                                                                                                                                                                                                    |
| --- | ------------------------------------------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 38  | Unified student dashboard                   | —       | ✅       | Done — `/institutions/[id]` composes a current-term course tile and a results tile from the step 40 and 41 reads; no new endpoint was needed                                                                              |
| 39  | Unified calendar                            | ✅      | ✅       | Done — the caller's timetable events for a date range behind `schedule:read`, a week calendar screen with a dashboard tile, filters by course and type, and exam terms as a second fetched layer (ADR 0013)               |
| 40  | Course 360° page                            | ✅      | ✅       | Done — the my-courses list and the course detail page behind it; grades and timetable are steps 41/39                                                                                                                     |
| 41  | Unified grades view with provenance         | ✅      | ✅       | Done — the caller's calculated, proposed and official results, effective grade and source/sync provenance on a grades screen and each course page                                                                         |
| 42  | Exam-term view                              | ✅      | ✅       | Done — the caller's exam terms behind `schedule:read` with kind, room, examiner, seats, registration window and their own registration; an exams screen filterable by course, kind and what the caller may act on         |
| 43  | Controlled exam registration                | ✅      | ✅       | Done — a student registers for and cancels an exam term behind `exam:register`; the read now answers `registrationAvailability` from the same rules, so every card says why a seat is out of reach (ADR 0013)             |
| 44  | Notification aggregation and deduplication  | ✅      | ✅       | Done — `notification_events` / `notification_deliveries`, the caller's inbox behind `notification:read`, emitted by the exam-terms importer and deduplicated per subject and aggregation window (ADR 0012)                |
| 45  | Teacher course / roster dashboard           | ✅      | ✅       | Done — `/institutions/:id/teaching` lists the offerings the caller leads with enrolment counts, and every course page carries a roster of enrolled students, gated on teaching or `offering:manage`                       |
| 46  | Admin connector configuration               | ✅      | ✅       | Done — a connector declares its credential fields and an admin stores them from the settings screen, encrypted at rest and never echoed back, behind `connector:configure` (ADR 0014); field mapping remains out of scope |
| 47  | Sync monitoring and retry UI                | ✅      | ✅       | Done — an administrator sees freshness per domain, the latest run's per-domain counts and errors, run history, and can start a run again                                                                                  |
| 48  | Mapping / conflict / reconciliation UI      | ⬜      | ⬜       | Not started — the read half landed with step 37; still needs the resolution decision (ADR) and the drill-down screen                                                                                                      |
| 49  | Structured audit events                     | ⬜      | ⬜       | Not started                                                                                                                                                                                                               |
| 50  | Personal-data inventory and export workflow | ⬜      | ⬜       | Not started                                                                                                                                                                                                               |
| 51  | Search over authorized canonical data       | ⬜      | ⬜       | Not started                                                                                                                                                                                                               |
| 52  | WCAG 2.2 AA implementation pass             | —       | ⬜       | Not started                                                                                                                                                                                                               |

### Operations and quality (53–63)

| #   | Task                                                 | Backend | Frontend | Status                                                                  |
| --- | ---------------------------------------------------- | ------- | -------- | ----------------------------------------------------------------------- |
| 53  | Observability: logs, health, metrics, sync freshness | ✅      | —        | In progress — freshness readable over the API, not exported as a metric |
| 54  | Containerization and repeatable deployment           | ✅      | ⬜       | In progress                                                             |
| 55  | Backup and restore procedures                        | ⬜      | —        | Not started                                                             |
| 56  | Unit and domain tests                                | ✅      | ⬜       | In progress — continuous                                                |
| 57  | Connector contract tests                             | ⬜      | —        | Not started                                                             |
| 58  | Integration tests with Moodle and mock SIS           | ⬜      | —        | Not started                                                             |
| 59  | End-to-end student / teacher / admin tests           | ⬜      | ⬜       | Not started                                                             |
| 60  | Authorization-negative and security tests            | ⬜      | ⬜       | Not started                                                             |
| 61  | Performance and load tests                           | ⬜      | ⬜       | Not started                                                             |
| 62  | Automated and manual accessibility tests             | —       | ⬜       | Not started                                                             |
| 63  | Migration dry run on synthetic data                  | ⬜      | —        | Not started                                                             |

### Evaluation and documentation (64–71)

| #   | Task                                            | Backend | Frontend | Status                                                                           |
| --- | ----------------------------------------------- | ------- | -------- | -------------------------------------------------------------------------------- |
| 64  | Second synthetic university (portability proof) | ⬜      | ⬜       | Not started                                                                      |
| 65  | Usability evaluation with representative users  | —       | —        | Blocked                                                                          |
| 66  | Comparison against separate-system baseline     | —       | —        | Not started                                                                      |
| 67  | API / OpenAPI and connector documentation       | ✅      | —        | In progress — `openapi.json` generated and drift-checked; connector docs missing |
| 68  | Administrator deployment and integration guide  | —       | —        | Not started                                                                      |
| 69  | User workflow documentation                     | —       | —        | Not started                                                                      |
| 70  | Thesis chapters                                 | —       | —        | Not started                                                                      |
| 71  | Reproducible demo and contingency demo          | ⬜      | ⬜       | Not started                                                                      |

## Carried work

Work the backlog does not number, raised by a step that could not absorb it. Take these
like a backlog step: one at a time, end to end.

| Work                                                        | Raised by | Why it is not a rider on that step                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Replace the Radix Select primitive with a native `<select>` | Step 38   | `@radix-ui/react-select` is the single largest thing in the shared client chunk and the only reduction left after the `shared/api` barrel narrowing. Swapping it changes the look and interaction of four already-shipped field groups — role granting, both institution-settings groups and the sync mode picker — and rewrites their tests, which is a UI change in its own right. The bundle guard was raised to 455 kB instead; take this before raising it again. |

## Gaps found outside the backlog

Reviewed on 2026-09-12 by reading the schema, the permission catalogue, every controller
and the connector interfaces against these documents. `Tasks Plan.md` is research output and
does not change, so work the 71 steps do not name is recorded here. Each row is a delivery
item in its own right — take it like a backlog step, one at a time, end to end.

| ID  | Gap                                                 | Evidence                                                                                                                                                                                                                                                                                                                                               | Weight                                                                                                                                                                                       |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | Nothing is ever written back to a source system     | `registerForExam` / `registerForCourse` are optional on `AcademicSystemConnector`, no caller exists and `mock-sis` implements neither; there is no cancel command at all, no outbox and no retry. `exam_registrations` carries provenance and an external-ID index but is not a `SYNC_DOMAIN`, so a source-side registration is never imported either. | **Blocking a truthful claim.** A student who registers in StudViro is not registered at the university. Needs an ADR before steps 43 and 48 can be called finished.                          |
| G2  | The whole LMS half of the canonical model is dead   | `learning_spaces`, `learning_activities`, `assessments`, `assessment_results`, `activity_completions` and `submission_refs` have no importer, no `SYNC_DOMAIN`, no read API and no screen. Steps 31–33 are all gated on a Moodle instance nobody has, and no `mock-lms` appears anywhere in the 71 steps.                                              | **Largest planning gap.** The product's headline claim — one calendar and one grade view across SIS _and_ LMS — is currently untestable. `mock-sis` was the same unblocker for the SIS half. |
| G3  | Assignment deadlines never reach a student          | `learning_activities.due_at` is indexed per institution for exactly this query; the calendar, the dashboard and the notifications have no deadline layer.                                                                                                                                                                                              | Follows from G2. Needs the layering decision ADR 0013 made for exam terms.                                                                                                                   |
| G4  | Eight of twenty-two permissions have no endpoint    | `program:read` / `program:manage`, `course:read` / `course:manage`, `offering:manage`, `enrollment:manage`, `schedule:manage`, `grade:propose` / `grade:publish` are granted by roles and enforced nowhere.                                                                                                                                            | Roles promise capabilities the API does not have: no catalogue, no course search, no grade entry, no enrolment correction, no timetable edit.                                                |
| G5  | No self-service course enrolment                    | `academic_terms.enrollment_opens_at` / `closes_at`, `course_offerings.capacity`, the `requested → provisioning → active` status ladder and `enrollments.lms_provisioned_at` / `lms_provisioning_error` model a request-and-provision workflow no code implements. There is no `enrollment:request` permission.                                         | A core AIS2 function, modelled and unbuilt. Not named by any of the 71 steps.                                                                                                                |
| G6  | No institution onboarding                           | There is no `POST /institutions` and no org-unit read. A tenant, its first `institution_admin` grant and its org units exist only if someone writes SQL. Scope ancestry supports org-unit-scoped grants, yet nothing can list an org unit to grant on.                                                                                                 | Also the root cause of the hand-edited demo data tax recorded in `STATUS.md`.                                                                                                                |
| G7  | No person directory                                 | Role grants take raw identifiers; the roster is the only list of people anywhere and is offering-scoped.                                                                                                                                                                                                                                               | Blocks a grant picker, examiner display and step 51.                                                                                                                                         |
| G8  | Grades have no writer                               | `course_results` separates calculated / proposed / official and only the importer ever writes a row, so the proposed stage is permanently empty unless a source system fills it.                                                                                                                                                                       | The middle stage exists so the _platform_ can host it. Pairs with G4.                                                                                                                        |
| G9  | Notifications cover one event family                | Three exam types. Grade publication, enrolment outcome and timetable changes are already detected by their importers and emit nothing; no staff-facing event, no unread badge outside the inbox, no preferences, no retention, no second channel.                                                                                                      | Step 44 shipped the mechanism, not the coverage.                                                                                                                                             |
| G10 | Synchronization has no schedule                     | `sync_run_trigger` already has `scheduled` and the BullMQ queue exists; nothing enqueues. Freshness is readable over the API but is not a metric (step 53).                                                                                                                                                                                            | Every run is hand-triggered, so freshness decays silently.                                                                                                                                   |
| G11 | Step 37's backend is on disk and uncommitted        | `reconciliation.service.ts`, `.types.ts`, its spec and DTO are untracked on `dev`; the controller, module, provenance repository and e2e spec are modified.                                                                                                                                                                                            | Commit or discard it before step 48 starts — step 48 is its screen.                                                                                                                          |
| G12 | Personal data is synchronized ahead of its controls | Steps 19 (GDPR inventory / DPIA), 20 (threat model), 49 (audit events) and 50 (export) are all `Not started` while names, enrolments and grades are already imported and served.                                                                                                                                                                       | Sequencing risk for the thesis, not a code defect.                                                                                                                                           |
