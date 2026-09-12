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

| #   | Task                                              | Backend | Frontend | Status                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------- | ------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 32  | Moodle identity / course / enrolment reads        | ⬜      | —        | Not started                                                                                                                                                                                                                            |
| 33  | Moodle activities, deadlines, completion, grades  | ⬜      | —        | Not started                                                                                                                                                                                                                            |
| 34  | AIS2 connector                                    | ⬜      | —        | Blocked on step 15                                                                                                                                                                                                                     |
| 35  | Synchronization engine and job state machine      | ✅      | ✅       | Done — engine, run state machine, watermarks and the run API ship, with the monitoring screen delivered by step 47                                                                                                                     |
| 36  | Retries, idempotency, change tracking, tombstones | ✅      | —        | Done — provenance upsert with a stale-write guard, per-domain watermarks, tombstones, child pruning and per-record failure accounting                                                                                                  |
| 37  | Reconciliation checks                             | ✅      | ✅       | Done — `GET institutions/:id/synchronization/reconciliation` reads both sides live and reports `missing_in_platform`, `missing_in_source`, `stale` and `conflict` per domain, resolving nothing; the sync monitor renders it on demand |

### Product surfaces (38–52)

| #   | Task                                        | Backend | Frontend | Status                                                                                                                                                                                                                                     |
| --- | ------------------------------------------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 38  | Unified student dashboard                   | —       | ✅       | Done — `/institutions/[id]` composes a current-term course tile and a results tile from the step 40 and 41 reads; no new endpoint was needed                                                                                               |
| 39  | Unified calendar                            | ✅      | ✅       | Done — the caller's timetable events for a date range behind `schedule:read`, a week calendar screen with a dashboard tile, filters by course and type, and exam terms as a second fetched layer (ADR 0013)                                |
| 40  | Course 360° page                            | ✅      | ✅       | Done — the my-courses list and the course detail page behind it; grades and timetable are steps 41/39                                                                                                                                      |
| 41  | Unified grades view with provenance         | ✅      | ✅       | Done — the caller's calculated, proposed and official results, effective grade and source/sync provenance on a grades screen and each course page                                                                                          |
| 42  | Exam-term view                              | ✅      | ✅       | Done — the caller's exam terms behind `schedule:read` with kind, room, examiner, seats, registration window and their own registration; an exams screen filterable by course, kind and what the caller may act on                          |
| 43  | Controlled exam registration                | ✅      | ✅       | Done — a student registers for and cancels an exam term behind `exam:register`; the read now answers `registrationAvailability` from the same rules, so every card says why a seat is out of reach (ADR 0013)                              |
| 44  | Notification aggregation and deduplication  | ✅      | ✅       | Done — `notification_events` / `notification_deliveries`, the caller's inbox behind `notification:read`, emitted by the exam-terms importer and deduplicated per subject and aggregation window (ADR 0012)                                 |
| 45  | Teacher course / roster dashboard           | ✅      | ✅       | Done — `/institutions/:id/teaching` lists the offerings the caller leads with enrolment counts, and every course page carries a roster of enrolled students, gated on teaching or `offering:manage`                                        |
| 46  | Admin connector configuration               | ✅      | ✅       | Done — a connector declares its credential fields and an admin stores them from the settings screen, encrypted at rest and never echoed back, behind `connector:configure` (ADR 0014); field mapping remains out of scope                  |
| 47  | Sync monitoring and retry UI                | ✅      | ✅       | Done — an administrator sees freshness per domain, the latest run's per-domain counts and errors, run history, and can start a run again                                                                                                   |
| 48  | Mapping / conflict / reconciliation UI      | ✅      | ⬜       | In progress — the read half ships as step 37, and the sync monitor shows the report behind a button. Still needs the resolution decision (ADR: platform-authored override vs. marked winner) and the drill-down that acts on a discrepancy |
| 49  | Structured audit events                     | ⬜      | ⬜       | Not started                                                                                                                                                                                                                                |
| 50  | Personal-data inventory and export workflow | ⬜      | ⬜       | Not started                                                                                                                                                                                                                                |
| 51  | Search over authorized canonical data       | ⬜      | ⬜       | Not started                                                                                                                                                                                                                                |
| 52  | WCAG 2.2 AA implementation pass             | —       | ⬜       | Not started                                                                                                                                                                                                                                |

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
| G11 | Step 37's backend is on disk and uncommitted        | Resolved 2026-09-12 — committed as `b8f610e` and `d31ef6b`, with the screen in the client's `053f390`.                                                                                                                                                                                                                                                 | —                                                                                                                                                                                            |
| G12 | Personal data is synchronized ahead of its controls | Steps 19 (GDPR inventory / DPIA), 20 (threat model), 49 (audit events) and 50 (export) are all `Not started` while names, enrolments and grades are already imported and served.                                                                                                                                                                       | Sequencing risk for the thesis, not a code defect.                                                                                                                                           |

## Business-logic and user-flow defects

Reviewed on 2026-09-12 by reading the rules themselves — the services, their repositories'
predicates and the enums behind them — and walking each journey end to end. The gaps above are
things not built; these are things built to a rule the model does not actually enforce, or flows
that stop. Several contradict a `Live` row in `Feature Status.md`, which has been corrected.

### Flow-breaking

| ID  | Defect                                               | What happens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | Identity claim is a dead end, and it poisons the run | `PersonsImporter` creates each account with an argon2 hash of two random UUIDs. There is no password reset, no email verification and no claim or invitation flow, so an imported person can never sign in. If they self-register first, every later sync of that person throws `IDENTITY_EMAIL_CONFLICT` — which is isolated per record but holds the `persons` watermark back, so the domain re-imports from the same point and reports `partial` on every run, for ever. `users/me/identities` is read-only; nothing implements the deliberate linking the error demands.                             |
| B2  | There is no path from an account to an institution   | Membership is defined as holding a role assignment (`InstitutionsService.listForUser`). Nothing creates one but the administrator's grant screen, and the first administrator can only be created in SQL (G6). No invitation, no request-to-join, and no rule deriving `student` from an active `program_membership`. Importing five thousand people yields five thousand permission-less accounts, each of which must be granted by typing a UUID into a form with no directory (G7).                                                                                                                   |
| B3  | Enrolment status is never enforced                   | `MyExamRegistrationsRepository.enrolledIn` tests only that an `enrollments` row exists and is not soft-deleted. A `withdrawn`, `rejected`, `requested` or `completed` student can register for the exam. The same blindness puts withdrawn and rejected enrolments into _My courses_, the course page, the calendar and the teacher's enrolment count. `NotificationEmitterRepository` is the only place in the codebase that filters (`provisioning`, `active`) — so the two halves of the exam flow disagree: you may register while withdrawn, and you will not be told when the exam moves.          |
| B13 | `role:assign` is checked at the wrong scope          | Every role-assignment route declares `RequirePermission('role:assign', INSTITUTION_SCOPE)`, so a faculty-scoped `org_unit_manager` — the role that exists to delegate — can grant nothing at all, while an institution-scoped one can grant `institution_admin`, to themselves. `RoleAssignmentsService.grant` validates the scope, the window and the duplicate, and never asks whether the caller holds the role they are handing out. Nothing protects the last `institution_admin` of an institution from being revoked either. Found 2026-09-12 while designing ADR 0016, which resolves all three. |

B1, B2 and B13 are designed as of 2026-09-12 in `adr/0015-accounts-and-institutional-membership.md`
and `adr/0016-administrative-authority.md`, and are sequenced into four steps in `STATUS.md`.

**Step (a), the identity schema, is built** (2026-09-12). `users.status` distinguishes
`invited` / `active` / `suspended`, `password_hash` is nullable, the email unique index
excludes invited rows, `external_identities.asserted_email` records what a source claimed,
and `user_emails` separates an asserted address from a proven one — only a verified address
is globally unique. The importer no longer throws `IDENTITY_EMAIL_CONFLICT`, so the `persons`
watermark can no longer be held back by a self-registered human; authenticating at the
institution's provider activates the invited record and proves the address. Sign-in and the
JWT strategy both read status, so an invited account cannot hold a session.

Steps (b) derived roles and grant rules, (c) institution creation, org-unit read and person
directory, and (d) invitations, accept-and-claim, merge and password reset remain. Until (d)
lands, an imported person still cannot sign in with a password — B1 is narrowed, not closed.

### Rules modelled but not enforced

| ID  | Defect                                                 | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B4  | The attempt ladder is decorative                       | `exam_term_kind` separates `regular` / `first_retake` / `second_retake` and nothing checks you failed the previous one. `exam_registration_status` carries `attended`, `no_show` and `excused`; no code ever sets them, so no attempt is ever consumed. `official_course_results` is unique per enrolment and `enrollments` unique per (offering, user), so a resit overwrites the failed attempt and its history is gone — the `attempt` column on both tables cannot be used. No pass/fail semantics exist anywhere: `FX` and `failed` are ordinary enum values, so nothing knows a student must resit, and no credits earned or weighted average is ever computed. |
| B5  | Result status is ignored by the effective grade        | `effectiveGrade` reads only the three grade columns. A result whose `status` is `annulled` still shows its official grade to the student as effective, and `disputed` and `corrected` never change what is displayed.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| B6  | Seven feature flags gate nothing                       | `courseRegistration`, `examRegistration`, `timetable`, `grades`, `thesis`, `accommodation` and `fees` are stored, validated, resolved over platform defaults and edited on the settings screen. No endpoint, guard, navigation item or screen reads one. Turning `examRegistration` off changes nothing — a live administrator control that lies. Three of the seven name capabilities that do not exist.                                                                                                                                                                                                                                                             |
| B7  | Terminology overrides are write-only                   | Outside the generated client, the only files that mention `terminology` are the form that edits it. No label anywhere renders an override.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| B8  | Registration windows have no fallback to the exam date | With `registration_opens_at` and `registration_closes_at` both null, `registrationState` returns `open` for ever and `isCancellable` returns true for ever — a student can register for, and cancel, an exam that happened last year. `mock-sis` always sets both windows, so it is invisible today; a real connector with sparse data reproduces it immediately.                                                                                                                                                                                                                                                                                                     |

### Flows that end badly

| ID  | Defect                                                | What happens                                                                                                                                                                                                                                                                                                                                                                            |
| --- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B9  | Cancelling an exam term leaves its registrations live | The importer emits `exam_term_cancelled`, and nothing cancels the `exam_registrations` rows pointing at that term. The one-live-registration-per-course rule then refuses the replacement term with `other_term_registered`, naming a term that no longer exists, until the student works out that they must cancel the dead one by hand.                                               |
| B10 | The notification audience is the wrong set            | It is everyone actively enrolled in the offering, not the people holding a seat. A registered student is told a term moved with no more urgency than a classmate who never registered, and — with B3 — a registered student whose enrolment is not `active` is not told at all. Teachers and examiners are never in the audience, so the examiner of a rescheduled exam learns nothing. |
| B11 | A cancelled registration is erased, not recorded      | `cancel` sets `status = 'cancelled'` _and_ `deleted_at`, and every read filters `deleted_at is null`, so the `cancelled` status is unreadable dead data. Neither the student nor a registrar can ever see that a cancellation happened; with B4 the cancel-and-re-register loop is unbounded and untraceable.                                                                           |
| B12 | The inbox never mentions your own commitments         | Registering and cancelling emit nothing. The inbox reports what the university changed and never what you undertook, so there is no confirmation trail for the one action a student can actually take.                                                                                                                                                                                  |

Smaller, same review: nothing checks that two exam terms a student registers for do not collide in
time; a seat freed by a cancellation is offered to nobody; and a `timetable_events.cancelled_at` is
rendered but emits no notification, though the importer already detects it.
