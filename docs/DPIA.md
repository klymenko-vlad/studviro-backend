# Data Protection Impact Assessment

Assessment of StudViro as it stands at 2026-09-19. Written against the code, not against an
intention: every mitigation claimed below names the file that implements it, and every
mitigation that does not exist is listed as not existing.

Companion to `GDPR Data Inventory.md`, which enumerates the fields. This document judges the
risk in holding them.

A DPIA is mandatory here on two Art. 35(3) grounds: systematic evaluation of personal
aspects (grades, retake ladders, attendance and lateness, producing decisions with legal or
similarly significant effect on a student's progression), and large-scale processing by a
public authority. The demo seed alone writes ~5,900 rows for one synthetic university;
a real faculty is an order of magnitude more.

## What the institution must supply

The same table as in `GDPR Data Inventory.md`. **This DPIA cannot be signed off until these
are filled in** — necessity and proportionality cannot be assessed against an unknown lawful
basis, and retention risk cannot be assessed against an unknown period.

| Unknown                             | What is needed                                                                                        | Why it blocks this assessment                                                                         |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Controller identity**             | Legal name, address and contact point of the institution operating the deployment                     | The controller signs the DPIA and owns every mitigation below                                         |
| **DPO contact**                     | Name or role title and contact address                                                                | Art. 35(2) requires the DPO's advice to be sought and recorded; there is no one to record it from     |
| **Lawful basis, per purpose**       | Art. 6 basis for the academic record, authentication, notification, and demo leads, stated separately | Determines whether Art. 17 erasure and Art. 21 objection apply. Risk R3 changes severity depending    |
| **Retention period, per category**  | Numbers for academic records, authentication artefacts, notifications, logs and leads                 | Every "kept for ever" finding below is only a _finding_ because no period exists to compare it to     |
| **Special-category data policy**    | Whether health-based excusals, accommodations or disciplinary detail will be entered, and where       | Decides whether Art. 9 applies at all. Risk R2 is rated on the assumption it does not — yet           |
| **Processors and hosting location** | Host of PostgreSQL, Redis and the mail transport, and the jurisdiction                                | Art. 28 and Chapter V. `docs/Deployment.md` records no provider, and local-only is the current ruling |
| **Subject-request procedure**       | Who handles access, rectification and erasure requests, and within what deadline                      | There is no endpoint for any of them, so the mitigation is entirely organisational                    |

## 1. Description of the processing

### Nature

StudViro is **the system of record** for an institution's academic data (ADR 0024). An
institution enters its own terms, programmes, courses, offerings, rooms, staff and students,
and StudViro is where that data lives. There is no upstream system and no synchronisation:
the integration premise was removed on 2026-09-18 because it had never been connected to
anything, and with it went the connectors, the sync engine and the provenance columns.

Practically, this means **there is no second copy**. An error here is not a stale mirror of
a correct record elsewhere; it is the record.

Architecture: a NestJS 11 modular monolith on Fastify, PostgreSQL 17 through Drizzle, Redis
7 for idempotency, rate limiting and one BullMQ queue. A Next.js 16 client acts as the BFF
and holds the session cookies. `ROLE=api|worker|all` splits the process.

### Scope — what is processed

Full field-level detail is in `GDPR Data Inventory.md`. In summary:

| Category                | Where                                                                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identifying and contact | `users`, `user_emails`, `invitations`, `demo_requests`, `external_identities`                                                                                               |
| Authentication          | `users.password_hash`, `refresh_tokens`, `password_reset_tokens`, `external_identities`                                                                                     |
| Academic (the core)     | `program_memberships`, `enrollments`, `official_course_results`, `exam_registrations`, `study_group_memberships`, `teaching_assignments`, `assessment_results`              |
| Behavioural             | `activity_completions`, `submission_refs.is_late`, `notification_deliveries.read_at`, `refresh_tokens.ip_address`/`user_agent`, `external_identities.last_authenticated_at` |
| Special category        | **None by design.** By inference: `exam_registrations.status = 'excused'`, and the free-text `official_course_results.conflict_note` and `assessment_results.feedback`      |
| Outside PostgreSQL      | Pino logs, Redis idempotency entries (full response bodies), BullMQ email jobs, signed JWTs carrying the email address                                                      |

### Context

**Data subjects:** students, teachers, registrars and administrators of the institution; and
prospective-demo requesters, who are not users of anything and submitted a public form.

Students are in the classic asymmetric position: they cannot decline to be in the system and
continue to study, they cannot verify what is held about them, and the records here decide
their progression. That asymmetry is why consent is almost certainly the _wrong_ lawful
basis for the academic record — `TODO(institution)` to confirm the basis actually relied on.

Staff are data subjects too, and this is easy to miss. `official_course_results` records
`proposed_by_id` and `official_recorded_by_id` with timestamps; `teaching_assignments` and
`exam_terms.examiner_id` name who teaches and examines what. That is staff-performance data.

**Recipients:** nobody outside the deployment. There is no external processor in the code
today — the mail transport is a `TODO` in `email.processor.ts` and sends nothing.

### Purposes

Running an institution's academic year: enrolment, teaching assignment, timetabling, exam
registration, grading, transcript, notification. Plus authentication, abuse prevention on
public forms, and lead capture from `/contact`.

## 2. Necessity and proportionality

Assessed field by field against the purpose. Most of the schema comes out well; four things
do not.

**Proportionate, and minimal for the purpose:**

- The academic tables carry the facts the purpose requires and no more. There is no date of
  birth, no national identifier, no address, no photograph, no nationality, no gender field
  anywhere in `src/database/schema/`. For a student information system that is a notably
  short list, and it is the strongest data-minimisation fact in this assessment.
- Secrets are never stored in the clear. `password_hash` is Argon2id at the OWASP baseline
  (`src/common/crypto/password.service.ts`); `refresh_tokens.token_hash`,
  `password_reset_tokens.token_hash` and `invitations.token_hash` are SHA-256 digests of
  random tokens, each with a schema comment saying a dump of the table must not be enough to
  impersonate anyone.
- Grade staging (`calculated` → `proposed` → `official`) and the per-attempt unique index on
  `official_course_results` exist so a resit does not overwrite a failure. That is retention
  of an adverse fact, and it is proportionate: an academic record that silently forgot a
  failed attempt would be inaccurate, which is its own Art. 5(1)(d) problem.

**Questionable:**

1. **`refresh_tokens.ip_address` and `user_agent` are collected on every sign-in and every
   rotation and nothing ever deletes them.** They are justified for session management and
   leak detection; keeping them indefinitely is not. There is no "your sessions" screen that
   surfaces them to the user, so the collection is not even serving the one purpose that
   would most obviously justify it.
2. **`demo_requests.ip_hash` is presented as pseudonymisation and is not.** It is an unsalted
   SHA-256 of the address (`hashIp`, `src/modules/marketing/demo-requests.service.ts`), and
   the IPv4 space is small enough to invert exhaustively. The purpose — recognising a repeat
   submitter — is legitimate and is already served by `submission_count` and the unique index
   on `email`. The IP adds little and is not what its comment claims it is.
3. **The idempotency cache stores full response bodies in Redis, keyed by user id.** Necessary
   for correctness on retried enrolments and grade writes; disproportionate in that a
   secondary, unencrypted copy of the academic record exists in a store nobody thinks of as
   holding academic records.
4. **`activity_completions` and `submission_refs.is_late`** record per-student engagement and
   lateness. There is no creation surface for them yet (Phase 2 of `Product Plan.md`), so
   the question is open rather than answered wrongly — but if they are ever populated
   automatically, the institution needs a stated purpose for engagement monitoring that is
   narrower than "because the LMS could".

## 3. Risks to data subjects

Severity is judged on impact to the subject × likelihood given the code as written. Five
grades: low, moderate, high, severe.

---

### R1 — Unauthorised access to grades and results, with no record that it happened

**Severity: HIGH.**

`official_course_results` holds every grade, every attempt, every annulment and every
dispute note for every student, and `enrollments.attempt` holds the retake history. A leak
or an internal snoop causes real harm — grades affect scholarships, progression and
employment — and is irreversible.

_What exists._ Access is guarded: `PermissionsGuard` and `@RequirePermission` (ADR 0016),
canonical roles with scope ancestry, `grade:propose` and `grade:publish` checked separately
so proposing is not publishing, and a platform-operator tier that holds **no** academic
permission at all. Repositories are transaction-mediated and institution-scoped, so a query
cannot cross tenants by accident.

_What does not._ **There is no audit log.** `grep -i audit` across `src` finds three code
comments and no table. Nothing records who read a student's transcript, who listed a roster,
or who changed a role assignment. The only accountability trail in the entire system is
`proposed_by_id` / `official_recorded_by_id` on the result row itself — which tells you who
wrote, never who read.

The consequence is not just that a breach is undetected. It is that a breach is
**unreconstructible**: Art. 33 requires the categories and approximate number of data
subjects affected to be reported within 72 hours, and nothing in this system could produce
that number for a read-only compromise.

---

### R2 — An inaccurate or unerasable academic record

**Severity: HIGH.**

_What exists._ Correction is modelled properly. `corrected` and `annulled` are result
statuses, `isVoidedResult` makes an annulled grade stop counting towards credits and the
weighted average, a cancelled exam term releases its seats, and a cancelled registration
stays visible beside the record rather than vanishing. `grade_corrected` is a notification
family, so a student learns that their grade changed.

_What does not._

- **Nothing in the system deletes anything.** `BaseRepository.hardDelete` exists
  (`src/database/repository/base.repository.ts:265`) and no service calls it. Every removal
  verb in the codebase — `UsersService.remove`, `RoleAssignmentsService`, the catalogue
  services — calls `softDelete`, which sets `deleted_at` and leaves the row and every field
  in it in the table. **Therefore no `onDelete: 'cascade'` in this schema has ever fired.**
  A "deleted" user keeps their email, display name and password digest indefinitely, and
  every enrolment, result and registration keyed to them stays live in the tables.
- **There is no erasure endpoint and no export endpoint.** `/me` exposes `GET` and `PATCH`
  only (`src/modules/users/me.controller.ts`). Art. 15, 17 and 20 are unimplemented; a
  subject access request would be answered by hand against `GDPR Data Inventory.md`.
- **There is no retention job.** `ScheduleModule.forRoot()` is registered in `app.module.ts`
  and nothing is scheduled against it.
- **`conflict_note` is unconstrained free text** on a disputed or corrected grade. It is
  where a dispute's substance will be written, and there is no reason to expect the substance
  to stay inside the academic category — health, bereavement and allegations of misconduct
  are exactly what causes a grade to be disputed. `TODO(institution)`: decide whether this
  field may hold Art. 9 data and constrain or govern it accordingly. The same applies to
  `assessment_results.feedback`.
- `exam_registrations.status = 'excused'` is an inference channel: a systematically excused
  student is visibly a student with something going on. Nothing sets it today (`STATUS.md`),
  which is the only reason this is not rated higher.

---

### R3 — Personal data retained for ever, because no period exists

**Severity: HIGH** as it stands, reducible to low by a decision plus a scheduled job.

Four accumulating stores, none of which any code ever empties:

| Store                   | What accumulates                                                       | Notable                                                                                                                                                                                 |
| ----------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `refresh_tokens`        | One row per sign-in and per rotation, each with an IP address and a UA | `purgeExpired` exists at `refresh-tokens.repository.ts:66` and **`grep` finds no caller**. The schema comment calls the index the one that "drives the expiry sweep"; there is no sweep |
| `password_reset_tokens` | One row per reset request, `consumed_at` set and row retained          | Low residual value, but a per-user timeline of account-recovery events                                                                                                                  |
| `invitations`           | One row per invitation, including never-accepted ones                  | **Personal data about people who never became users** and never acted                                                                                                                   |
| `demo_requests`         | One row per lead, `status` moved to `archived` and row retained        | No admin surface removes one                                                                                                                                                            |

The `invitations` case is the sharpest: the institution asserted somebody's email address,
the person ignored it, and the assertion is now permanent with no route for them to object
to something they were never told about.

`TODO(institution)` on every row of that table.

---

### R4 — Authentication compromise

**Severity: MODERATE.** Well handled, with two specific gaps.

_What exists, and is genuinely good._

- Argon2id at 19 MiB / 2 / 1, with `needsRehash` so the cost can be raised and existing
  digests upgraded on next sign-in.
- Rotating refresh tokens with **reuse detection** (ADR 0003): a second redemption of an
  already-rotated token revokes the whole family and increments `token_version`, which
  invalidates outstanding access tokens too. The revocation is deliberately committed rather
  than thrown out of the transaction (`auth.service.ts`, the comment at the `revokedAt`
  branch) so the very act of detecting the leak cannot be rolled back.
- A separate, much smaller throttle budget on credential routes than on ordinary reads
  (`CREDENTIAL_THROTTLER`, `app.module.ts:110`), with shared Redis storage so N replicas do
  not each serve the full limit.
- Enumeration resistance: `PasswordResetService.request` returns the same shape whether or
  not the address exists, with a comment saying exactly why; `demo_requests` does the same.
- Reset confirmation revokes every session and bumps `token_version`.
- Tokens live in `httpOnly` cookies set by the BFF and are never handed to browser
  JavaScript (`frontend/src/shared/auth/auth-route.ts`, `shared/config/session.ts`).

_Gaps._

- **The access token JWT carries the email address** (`token.service.ts:32`). A JWT is
  signed, not encrypted; anyone who obtains one reads the address. It is a small marginal
  disclosure over what holding the token already permits, but it is unnecessary.
- **No second factor, anywhere.** Justifiable while OIDC SSO is the stated direction
  (`external_identities` was kept through the ADR 0024 removal for exactly that), but today
  a password is the only thing between an attacker and a registrar account holding
  `grade:publish` across an institution.

---

### R5 — Personal data leaking into logs

**Severity: MODERATE.**

_What exists._ Redaction is configured in `src/common/logger/logger.module.ts` and covers the
things most often got wrong: `authorization`, `x-api-key`, `proxy-authorization`, `cookie`
and `set-cookie` on both directions, and `req.body.password`, `req.body.token`,
`req.body.refreshToken`. Health endpoints are excluded from autologging. 401/403/429 are
raised to `warn` on purpose so an attack is visible at the default level.

_What does not._ The redaction list is **allow-by-default on bodies** — three named fields
are censored and everything else is logged. A request body containing `email`,
`displayName`, `address`, a demo request's free-text `message`, a `conflictNote` or
`feedback` goes into the log intact. Request URLs carry user, enrolment and result UUIDs by
default in `pino-http`. `AllExceptionsFilter` logs the raw `err` object
(`all-exceptions.filter.ts:126`), and a Drizzle-wrapped driver error can carry the offending
statement's parameter values — i.e. field values — into a 500-level line.

And there is no log retention or destination in the repository at all: `TODO(institution)`.

---

### R6 — Personal data outside PostgreSQL, in stores nobody audits

**Severity: MODERATE** today; **HIGH** the moment email sending is switched on.

_Redis._ The idempotency interceptor keys entries `idem:<userId>:<method>:<url>:<key>` — the
user id and the full request URL are in the **key** — and stores the complete serialised
response body as the value for `idempotencyTtlMs`. For a grade write or an enrolment that is
the academic record, sitting in a store with no access control of its own beyond the Redis
password, no encryption configured by this code, and no audit. Throttle counters are
IP-derived and short-lived; the distributed lock has no callers.

_BullMQ._ One queue, `email`, in the same Redis. `passwordReset` job payloads carry
`{ userId, email, resetToken, expiresAt }` — **the raw reset token**, the one value
`password_reset_tokens` deliberately refuses to store. `QueueModule.forRoot` sets
`removeOnFail` to 24 hours, while `RESET_TTL_MS` is one hour: **a failed job retains a live
credential's plaintext for 23 hours after the credential itself has expired.**

_Why this is only moderate today:_ `grep` for `enqueueEmail` finds **no callers**. Nothing
enqueues anything; `EmailProcessor` logs and returns. The exposure is entirely latent — and
it goes live unremarked the moment somebody fills in the `// TODO: swap for the real mail
transport` in `email.processor.ts`. That is the worst kind of latent risk: one line of
unrelated feature work turns it on.

---

### R7 — Cross-institution leakage through shadow user rows

**Severity: MODERATE.**

`users_email_unique_idx` deliberately excludes `status = 'invited'` rows, so two institutions
can each hold a shadow row for the same human — correct, and the schema comment explains why.
But `UsersRepository.findInvitedByEmail` **is not scoped to the inviting institution**
(recorded in `STATUS.md` and ADR 0018), so two institutions inviting the same address contend
for one row. The failure mode is a person accepting institution A's invitation and landing on
a record institution B created, or a merge (`MergeService`) joining two people who are not
the same person. Either way the result is one institution's roster data visible to another's
member.

The scoping is a single `where` clause. It is listed as a known caveat and has not been
fixed.

---

### R8 — Attendance and engagement inference from structural tables

**Severity: LOW-MODERATE.**

Individually innocuous tables compose into a surveillance-shaped record.
`study_group_memberships` names who is in which seminar; `timetable_events` places that
seminar in a room at a time; `notification_deliveries.read_at` is a read receipt proving a
named person opened a specific message at a specific moment;
`external_identities.last_authenticated_at` and the `refresh_tokens` IP history give login
times and locations. None of it is collected for monitoring. All of it answers "where was
this student on Tuesday, and were they reading their mail".

Low today because the querying surface does not exist. It rises if reporting is built
without deciding first what may be aggregated about an individual.

---

### R9 — Demo requesters: personal data held on people with no relationship

**Severity: LOW-MODERATE.**

`demo_requests` holds `contact_name`, `email`, `role`, a free-text `message`, a `user_agent`
and a reversible `ip_hash` for someone who filled in a web form. The form is throttled
(`@PublicFormThrottle()`, sized separately from the login budget precisely so one submitter
behind the BFF proxy cannot lock out sign-in) and has a honeypot `website` field. Nothing
deletes a row, no admin screen exists to delete one, and the lawful basis is unstated:
`TODO(institution)`.

---

## 4. Mitigations — what exists and what does not

### In the code today

| Mitigation                                     | Where                                                                                        | Addresses     |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------- |
| No excess identity data collected at all       | `src/database/schema/` — no DOB, national id, address, photo, gender anywhere                | Minimisation  |
| Argon2id with rehash policy                    | `common/crypto/password.service.ts`                                                          | R4            |
| Secrets stored only as digests                 | `refresh_tokens`, `password_reset_tokens`, `invitations` — all `token_hash`                  | R4            |
| Refresh rotation with reuse detection          | `modules/auth/auth.service.ts`, ADR 0003                                                     | R4            |
| `token_version` kill switch                    | `users.token_version`, bumped on reset and on reuse detection                                | R4            |
| Credential-specific rate limit, in Redis       | `app.module.ts:110-135`                                                                      | R4            |
| Enumeration-resistant reset and lead form      | `password-reset.service.ts`, `demo-requests.service.ts`                                      | R4, R9        |
| Permission catalogue, scoped, guard-enforced   | `PermissionsGuard`, `@RequirePermission`, ADR 0016                                           | R1            |
| Propose and publish as separate permissions    | `grade:propose` / `grade:publish`                                                            | R1            |
| Platform operators hold no academic permission | ADR 0016                                                                                     | R1            |
| Institution-scoped repositories                | `database/repository/base.repository.ts`, transaction-mediated                               | R1, R7        |
| Derived roles, not grantable by hand           | `student` from a programme membership, `teacher` from a teaching assignment (ADRs 0015-0018) | R1            |
| Last-admin protection                          | An institution's last admin cannot be revoked                                                | Availability  |
| Header and credential redaction in logs        | `common/logger/logger.module.ts`                                                             | R5 (partial)  |
| Idempotency keyed per principal                | `cacheKeyFor`, `idempotency.interceptor.ts` — so two users cannot collide on a key           | R6 (partial)  |
| `httpOnly` session cookies, BFF-held           | `frontend/src/shared/config/session.ts`, `shared/auth/auth-route.ts`                         | R4            |
| Correction modelled rather than overwritten    | `corrected` / `annulled` statuses, per-attempt result rows, `grade_corrected` notice         | R2 (accuracy) |

### Not in the code

Ordered by what this assessment judges most urgent.

1. **An audit log of reads and administrative writes.** Nothing else on this list matters as
   much. Without it R1 is not just unmitigated, it is undetectable and unreportable. Minimum:
   who, what subject, what record, when, from where — for grade reads, roster reads, role
   changes and any bulk export. (Backlog O2, the threat model, should size this.)
2. **Wire up `purgeExpired` and write the other three retention jobs.** The method is
   written and dead; `ScheduleModule` is registered and empty. Needs `TODO(institution)`
   periods first, but the job is an afternoon's work once a number exists.
3. **A real erasure path.** Decide per table whether erasure means a hard delete, an
   anonymisation of the `users` row with the academic record retained under a statutory
   basis, or a refusal recorded against Art. 17(3). Then implement it, because today
   "delete user" means "hide user".
4. **Art. 15 export.** One endpoint producing everything in `GDPR Data Inventory.md` for one
   subject. It is a large join and nothing else.
5. **Tighten log redaction to deny-by-default on bodies.** Redact `req.body` wholesale and
   allow-list what may be logged, rather than the reverse.
6. **Shorten `removeOnFail` on the email queue below `RESET_TTL_MS`, or keep the reset token
   out of the job payload entirely** (enqueue the token id and re-read it in the processor).
   Do this _before_ the mail transport is connected, not after.
7. **Salt `demo_requests.ip_hash`, or drop the column.** `submission_count` already does the
   job it was added for.
8. **Scope `UsersRepository.findInvitedByEmail` to the inviting institution.** One `where`
   clause, closes R7.
9. **Drop `email` from the access-token payload** and read it from `users` where needed.
10. **Surface active sessions to the user** — the one purpose that would justify keeping
    `refresh_tokens.ip_address` at all, and a self-service revocation path with it.
11. **Constrain or govern the free-text fields** — `conflict_note`, `feedback`,
    `demo_requests.message`, `enrollments.lms_provisioning_error`. At minimum, an on-screen
    warning that special-category data must not be entered.
12. **Encryption at rest and TLS for Redis and PostgreSQL.** `config.redis.tls` is a flag
    the code honours; whether it is set is a deployment fact and belongs with the
    `TODO(institution)` hosting decision.
13. **Second factor for accounts holding `grade:publish` or `role:assign`**, or OIDC SSO
    with the institution's own MFA.

## 5. Residual risk and sign-off

With the mitigations that exist and none of those that do not, the residual risk is
**high** — driven by R1 (no audit trail over grade access), R2 (no erasure, no hard delete,
free-text fields with no Art. 9 guard) and R3 (indefinite retention by default).

Items 1 through 4 of the _Not in the code_ list, plus the `TODO(institution)` retention
periods, would bring it to moderate. Items 5 through 9 are small and should be taken
opportunistically.

**Prior consultation with the supervisory authority** under Art. 36 is required only if the
residual risk remains high after mitigation. On the assumption that items 1-4 are delivered,
it should not be — but that judgement belongs to the DPO, and there is no DPO:
`TODO(institution)`.

Sign-off: `TODO(institution)` — controller representative and DPO, with date.
Review trigger: any of the following — the mail transport is connected; file storage lands
(Phase 2, L1); `activity_completions` or `submission_refs` gain a writer; any field capable
of holding Art. 9 data is added; the deployment moves off local-only.
