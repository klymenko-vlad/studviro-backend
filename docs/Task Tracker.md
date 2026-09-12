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
| Read and answer a captured demo request                     | Marketing | The landing pages and `POST /api/v1/demo-requests` shipped together; the rows they write are reachable only by SQL. An operator surface belongs with ADR 0016's platform operator, not with a public form. Two more prerequisites before the form takes real traffic: `/privacy` and `/terms` do not exist, and the per-IP throttle collapses to one bucket behind the BFF proxy until the proxy forwards the client address and `TRUSTED_PROXIES` names the hop       |

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
| G6  | No institution onboarding                           | **Closed 2026-09-12** by step (c). `POST /institutions` creates a tenant and its first `institution_admin` grant behind the platform-operator `RolesGuard` tier; `GET .../org-units` and `GET .../org-units/:id` list the tree behind `role:read`. A tenant no longer needs a hand-written `INSERT`.                                                   | Was also the root cause of the hand-edited demo data tax; step (c) retired the seed's need for it.                                                                                           |
| G7  | No person directory                                 | **Closed 2026-09-12** by step (c). `GET .../people` lists every person holding a granted or derived role in an institution, institution-scoped and behind `role:read`, closing the institution-wide derived-role gap step (b) deliberately left open. Role grants and the examiner display can now use it as a picker.                                 | Was blocking a grant picker, examiner display and step 51; the picker itself is not yet wired into the grant form (left for the next UI pass).                                               |
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

| ID  | Defect                                               | What happens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | Identity claim is a dead end, and it poisons the run | **Closed 2026-09-12 by step (d).** `POST /institutions/:id/invitations` (behind `role:assign`, institution-scoped) issues a single-use, 7-day, SHA-256-hashed token; `POST /invitations/:token/accept` is public, answers identically for an unknown, expired or already-consumed token, sets a password and activates the record, or merges it into an already-active account under the same address in one transaction. `POST /auth/password-reset/request` and `.../{token}/confirm` cover the self-service reset ADR 0015 called load-bearing, both behind `@PublicFormThrottle()`, and both answer identically whether or not the address exists.                                                                                                                                                                                                                                 |
| B2  | There is no path from an account to an institution   | **Narrowed further 2026-09-12 by step (d).** `POST /institutions` now accepts `firstAdminEmail` as an alternative to `firstAdminUserId`, creating an `institution_admin` invitation in the same transaction rather than requiring an existing account id (ADR 0017's consequence, settled by ADR 0018). What remains: nobody outside an existing invitation or a platform operator can end up with an account at all — there is still no request-to-join.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| B3  | Enrolment status is never enforced                   | **Fixed 2026-09-12** in `4124c25` (backend) and `c0eae3f` (client). Two predicates beside the enum carry the rule: `ENROLLMENT_PARTICIPATING_STATUSES` (`provisioning`, `active`) for the notification audience only, and `ENROLLMENT_RECORDED_STATUSES` (those plus `completed`) for every read and for exam registration. `withdrawn`, `rejected` and `requested` no longer reach _My courses_, the course page, the calendar, the roster, the teacher's enrolment count or an exam seat. **`completed` was deliberately left able to register**, against this row's original wording: a resit is the retake ladder's whole point, `my-exam-registrations.e2e-spec.ts` already asserted it, and a finished course still owes its student their grades and a non-empty roster. The client's `ENROLLED_STATUSES` mirrored the rule and counted `requested`; it now matches the server. |
| B13 | `role:assign` is checked at the wrong scope          | **Fixed 2026-09-12.** `role:assign` is now checked at the scope being granted or revoked on, not at the institution, so a faculty-scoped `org_unit_manager` can delegate within their faculty and an institution-scoped one can no longer reach beyond what they hold. `RoleAssignmentsService.grant` refuses a role whose permissions exceed the caller's own (`ROLE_NOT_HELD_BY_GRANTER`), and `revoke` refuses to remove an institution's last `institution_admin` (`LAST_INSTITUTION_ADMIN`).                                                                                                                                                                                                                                                                                                                                                                                      |

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

**Step (b), derived roles and the grant rules, is built** (2026-09-12), closing B13 and
narrowing B2. `AuthorizationService.rolesIn` unions granted assignments with roles derived
from the academic model — `student` from an active `program_membership` at institution
scope, `teacher`/`teaching_assistant` from a `teaching_assignments` row at its course
offering's scope — via `DerivedRolesRepository`. `GrantRoleDto` accepts only the five roles
an academic record cannot express (`GRANTABLE_ROLES`); the grant screen's role list is the
server's answer, not a client-side copy. `RoleAssignmentResponseDto` carries `source` and
`revocable`, so a derived membership appears in the roster read-only. `RoleAssignmentsService`
now checks `role:assign` at the resolved scope for both grant and revoke, refuses to hand out
a role whose permissions the caller does not already hold (`ROLE_NOT_HELD_BY_GRANTER`), and
refuses to revoke an institution's last `institution_admin` (`LAST_INSTITUTION_ADMIN`).

**Step (c), institution creation, the org-unit read and the person directory, is built**
(2026-09-12), closing G6 and G7 and narrowing B2 further. `POST /institutions` sits behind the
platform-operator `RolesGuard` tier from ADR 0016 — never the canonical `PermissionsGuard` —
and creates the institution and its first `institution_admin` grant in one transaction; a
duplicate code is a conflict, an unknown first administrator is a 404. `GET
.../org-units[/:id]` and `GET .../people` are both institution-scoped behind `role:read`;
the person directory merges granted assignments with every derived role
(`DerivedRolesRepository.findAllForInstitution`), which is the institution-wide enumeration
step (b) deliberately deferred to this step. The hand-edited demo data tax is retired: an
institution and its first administrator no longer require a hand-written `INSERT`.

**Step (d), invitations, accept-and-claim, merge and password reset, is built** (2026-09-12),
closing B1 and narrowing B2. `invitations` carries institution, address, the `(role, scopeType,
scopeId)` it grants, inviter, a hashed single-use token and its 7-day expiry; accepting one
either promotes the `invited` shadow in place, attaches the grant to an already-active account,
or — when both exist under the same address — merges the shadow into the survivor inside one
transaction, repointing `external_identities`, `role_assignments`, `program_memberships`,
`enrollments` (carrying `official_course_results` with it), `teaching_assignments`,
`exam_registrations`, `study_group_memberships` and `notification_deliveries`, then soft-deletes
the shadow with `merged_into_user_id` set. Password reset is the same token shape, scoped to an
already-active account. `POST /institutions` gained `firstAdminEmail` alongside
`firstAdminUserId`; ADR 0018 records both decisions and the merge's known limitation (a unique
collision between the shadow's row and one the survivor already holds fails the whole accept
rather than resolving it).

**Step (d)'s password-reset screen shipped 2026-09-12**, closing the gap the step itself had
left. `/forgot-password` and `/reset-password`, linked from `/sign-in`'s "Forgot password?" and
reached by nobody who can already sign in, cover the backend built alongside invitations: a
neutral confirmation regardless of whether the address exists, and one failure message for an
expired, consumed or malformed token — the same non-enumeration shape ADR 0018 chose for accept.
Recovering the bundle headroom to fit it meant swapping `shared/ui`'s `Select` from
`@radix-ui/react-select` to a native `<select>` across all six call sites, dropping the measured
total from 453.45 kB to 425.84 kB before the new screens spent 5.63 kB of it back down to
431.47 kB — comfortably under the 455 kB guard, which was not raised.

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
