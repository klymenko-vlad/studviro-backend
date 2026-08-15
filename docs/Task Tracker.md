# Task Tracker

The live checklist for the 71-step backlog in `docs/Tasks Plan.md`. That document is the
research plan and does not change; this one records what is actually built. Update it in the
same commit as the work it describes.

Last updated: 2026-08-15

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

| #   | Task                                                   | Backend | Frontend | Status                                       |
| --- | ------------------------------------------------------ | ------- | -------- | -------------------------------------------- |
| 1   | Freeze thesis problem statement and research questions | —       | —        | Done                                         |
| 2   | Explicit in-scope / out-of-scope list                  | —       | —        | Done                                         |
| 3   | Inventory actors and stakeholders                      | —       | —        | In progress                                  |
| 4   | Catalogue AIS2 functions                               | —       | —        | Done                                         |
| 5   | Catalogue Moodle functionality and APIs                | —       | —        | Done                                         |
| 6   | Validate workflows with real university users          | —       | —        | Blocked                                      |
| 7   | AIS2 ↔ Moodle ↔ unified feature mapping                | —       | —        | Done                                         |
| 8   | Classify features P0–P3                                | —       | —        | Done                                         |
| 9   | Define user journeys                                   | —       | —        | In progress                                  |
| 10  | Source-of-truth matrix per shared entity               | —       | —        | Done                                         |
| 11  | Canonical domain model                                 | —       | —        | Done                                         |
| 12  | External-ID and provenance model                       | —       | —        | Done                                         |
| 13  | Generic `AcademicSystemConnector` interface            | —       | —        | In progress — specified in the plan, no code |
| 14  | Generic `LearningSystemConnector` interface            | —       | —        | In progress — specified in the plan, no code |
| 15  | Document available AIS2 access                         | —       | —        | Blocked                                      |
| 16  | Synchronization semantics                              | —       | —        | In progress                                  |
| 17  | Authentication strategy and development IdP            | —       | —        | Done                                         |
| 18  | Canonical RBAC / scoping model                         | —       | —        | Done                                         |
| 19  | GDPR data inventory and DPIA screening                 | —       | —        | Not started                                  |
| 20  | Threat model                                           | —       | —        | Not started                                  |
| 21  | Information architecture and wireframes                | —       | —        | In progress                                  |
| 22  | Usability review of wireframes                         | —       | —        | Not started                                  |

### Platform foundation (23–31)

| #   | Task                                                  | Backend | Frontend | Status                                                                                                                                                                                       |
| --- | ----------------------------------------------------- | ------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 23  | Select technical stack                                | —       | —        | Done                                                                                                                                                                                         |
| 24  | Repository structure, tooling, CI                     | ✅      | ✅       | Done                                                                                                                                                                                         |
| 25  | Migration infrastructure and canonical schema         | ✅      | —        | Done                                                                                                                                                                                         |
| 26  | Authentication and identity linking                   | ✅      | ✅       | In progress — credentials, `ExternalIdentity` linking and the linked-accounts screen ship; OIDC strategy blocked on client registration                                                      |
| 27  | Server-side authorization and scoped roles            | ✅      | ⬜       | In progress — permissions, scope hierarchy, `PermissionsGuard` and the role assignment API ship, and a person can read their own roles; the administrator's grant and revoke UI is not built |
| 28  | Institution configuration, terminology, feature flags | ⬜      | ⬜       | Not started                                                                                                                                                                                  |
| 29  | Synthetic / mock SIS connector                        | ⬜      | —        | Not started                                                                                                                                                                                  |
| 30  | Realistic synthetic university dataset                | ⬜      | —        | Not started                                                                                                                                                                                  |
| 31  | Moodle development instance                           | —       | —        | Not started                                                                                                                                                                                  |

### Integration (32–37)

| #   | Task                                              | Backend | Frontend | Status                                                           |
| --- | ------------------------------------------------- | ------- | -------- | ---------------------------------------------------------------- |
| 32  | Moodle identity / course / enrolment reads        | ⬜      | —        | Not started                                                      |
| 33  | Moodle activities, deadlines, completion, grades  | ⬜      | —        | Not started                                                      |
| 34  | AIS2 connector                                    | ⬜      | —        | Blocked on step 15                                               |
| 35  | Synchronization engine and job state machine      | ⬜      | —        | Not started                                                      |
| 36  | Retries, idempotency, change tracking, tombstones | ⬜      | —        | In progress — generic queue, lock and idempotency plumbing exist |
| 37  | Reconciliation checks                             | ⬜      | ⬜       | Not started                                                      |

### Product surfaces (38–52)

| #   | Task                                        | Backend | Frontend | Status      |
| --- | ------------------------------------------- | ------- | -------- | ----------- |
| 38  | Unified student dashboard                   | ⬜      | ⬜       | Not started |
| 39  | Unified calendar                            | ⬜      | ⬜       | Not started |
| 40  | Course 360° page                            | ⬜      | ⬜       | Not started |
| 41  | Unified grades view with provenance         | ⬜      | ⬜       | Not started |
| 42  | Exam-term view                              | ⬜      | ⬜       | Not started |
| 43  | Controlled exam registration                | ⬜      | ⬜       | Not started |
| 44  | Notification aggregation and deduplication  | ⬜      | ⬜       | Not started |
| 45  | Teacher course / roster dashboard           | ⬜      | ⬜       | Not started |
| 46  | Admin connector configuration               | ⬜      | ⬜       | Not started |
| 47  | Sync monitoring and retry UI                | ⬜      | ⬜       | Not started |
| 48  | Mapping / conflict / reconciliation UI      | ⬜      | ⬜       | Not started |
| 49  | Structured audit events                     | ⬜      | ⬜       | Not started |
| 50  | Personal-data inventory and export workflow | ⬜      | ⬜       | Not started |
| 51  | Search over authorized canonical data       | ⬜      | ⬜       | Not started |
| 52  | WCAG 2.2 AA implementation pass             | —       | ⬜       | Not started |

### Operations and quality (53–63)

| #   | Task                                                 | Backend | Frontend | Status                               |
| --- | ---------------------------------------------------- | ------- | -------- | ------------------------------------ |
| 53  | Observability: logs, health, metrics, sync freshness | ✅      | —        | In progress — sync freshness missing |
| 54  | Containerization and repeatable deployment           | ✅      | ⬜       | In progress                          |
| 55  | Backup and restore procedures                        | ⬜      | —        | Not started                          |
| 56  | Unit and domain tests                                | ✅      | ⬜       | In progress — continuous             |
| 57  | Connector contract tests                             | ⬜      | —        | Not started                          |
| 58  | Integration tests with Moodle and mock SIS           | ⬜      | —        | Not started                          |
| 59  | End-to-end student / teacher / admin tests           | ⬜      | ⬜       | Not started                          |
| 60  | Authorization-negative and security tests            | ⬜      | ⬜       | Not started                          |
| 61  | Performance and load tests                           | ⬜      | ⬜       | Not started                          |
| 62  | Automated and manual accessibility tests             | —       | ⬜       | Not started                          |
| 63  | Migration dry run on synthetic data                  | ⬜      | —        | Not started                          |

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
