# GDPR Data Inventory

What personal data StudViro holds, where it is, why it is there, and what removes it.

Derived from `src/database/schema/*.ts` at 2026-09-19, plus the non-table stores in
`src/common`, `src/queue` and Redis. Every field named below was read out of the schema; if
a field is not listed, the table does not have it.

StudViro is the system of record (ADR 0024). There is no upstream system to push an erasure
to and none to receive one from — whatever is here is the only copy the institution has.

## What the institution must supply

None of the following is knowable from the code. Each is marked `TODO(institution)` inline
where it bites.

| Unknown                             | What is needed                                                                                                         | Why                                                                                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Controller identity**             | Legal name, registered address and contact point of the institution operating the deployment                           | Art. 13/14 require it in every privacy notice; the code has an `institutions` row with a `code` and a `name`, which is not a controller |
| **DPO contact**                     | Name or role title and a contact address for the data protection officer                                               | A public body processing student records must designate one (Art. 37) and publish the contact (Art. 37(7))                              |
| **Lawful basis, per purpose**       | The Art. 6 basis for each purpose in the _Why it exists_ column — academic record, authentication, notification, leads | Determines whether erasure, objection and portability apply at all, and what a notice must say                                          |
| **Retention period, per category**  | How long an academic record, an authentication artefact, a notification, a log line and a demo lead may be kept        | Nothing in the code expires anything except JWTs. Retention cannot be implemented until a number exists                                 |
| **Special-category data policy**    | Whether disability accommodations, health-based exam excusals or similar will ever be entered, and where               | No Art. 9 field exists today; `excused` on `exam_registrations` and `conflict_note` are where such data would arrive in free text       |
| **Processors and hosting location** | Who hosts PostgreSQL, Redis and the mail transport, and in which jurisdiction                                          | Art. 28 contracts and Chapter V transfer assessment; `docs/Deployment.md` records no provider yet                                       |
| **Subject-request procedure**       | Who receives an access, rectification or erasure request and within what internal deadline                             | There is no endpoint for any of them (see _What is missing_), so the procedure is manual by definition                                  |

## How to read the _Deleted by_ column

- **Soft delete only** — a `deleted_at` timestamp is set by
  `BaseRepository.softDelete` (`src/database/repository/base.repository.ts:227`). **The row
  and every field in it stay in the table.** Reads filter on `deleted_at is null`; a
  database dump, a backup and a direct query do not.
- **Cascade** — `onDelete: 'cascade'` on the foreign key. Only fires on a _hard_ delete of
  the parent row. `BaseRepository.hardDelete` exists (line 265) but no service calls it.
- **Nothing** — no code path removes the row at all.

The practical consequence: **`hardDelete` is unreachable from any HTTP route, so no cascade
in this schema has ever fired in production.** The only hard delete in the codebase is
`src/database/demo-seed/write-plan.ts:95-96`, which drops the demo institution and every
user whose email matches the seed's domain before re-seeding.

## Identity and authentication

### `users` — `src/database/schema/users.ts`

| Field                 | Category                                      |
| --------------------- | --------------------------------------------- |
| `email`               | identifying, contact                          |
| `display_name`        | identifying                                   |
| `password_hash`       | authentication                                |
| `locale`              | behavioural (preference)                      |
| `role`, `status`      | identifying (platform tier)                   |
| `token_version`       | authentication                                |
| `merged_into_user_id` | identifying (links two records for one human) |

**Subject:** every student, teacher, staff member and platform operator.
**Why:** the account. `password_hash` is Argon2id, 19 MiB / 2 iterations / 1 lane
(`src/common/crypto/password.service.ts`) — a digest, not a password.
**Deleted by:** soft delete only. `UsersService.remove`
(`src/modules/users/users.service.ts:85`) calls `softDelete`, and `DELETE /users/:id` is the
only removal verb. **The email, the display name and the password digest of a "deleted" user
remain in the table indefinitely.** `MergeService` (`src/modules/invitations/merge.service.ts:61`)
also soft-deletes the losing shadow row rather than removing it.
**Retention:** `TODO(institution)`.

Two structural notes. `users_email_unique_idx` is partial —
`deleted_at is null and status <> 'invited'` — so a soft-deleted account does not block
re-registration under the same address, and the old row keeps its copy of the email. And
`invited` rows are deliberately not unique on email, so one human can have several shadow
rows across institutions; `UsersRepository.findInvitedByEmail` is not institution-scoped
(see `STATUS.md` and ADR 0018), which means two institutions inviting the same address
contend for one row.

### `user_emails` — `user-emails.ts`

`address` (identifying, contact), `institution_id`, `verified_at`, `is_primary`.
**Subject:** any account holder with more than one address.
**Why:** an institutional address alongside a private one, and proof of control of a mailbox.
**Deleted by:** cascade from `users` (unreachable) or `institutions`; otherwise soft delete.
Only a _verified_ address is globally unique, so unverified assertions by two institutions
coexist as two rows.

### `external_identities` — `external-identities.ts`

`provider`, `issuer`, `subject`, `external_username`, `asserted_email`,
`last_authenticated_at`, `last_synchronized_at`. Category: identifying and authentication;
`asserted_email` is contact.
**Subject:** anyone signing in through an institutional IdP.
**Why:** OIDC single sign-on. Kept through the ADR 0024 removal precisely because it is an
authentication concern and not integration provenance.
**Deleted by:** cascade from `users`; otherwise soft delete. `last_authenticated_at` is a
login-time trace and is behavioural as well as authentication data.

### `refresh_tokens` — `refresh-tokens.ts`

`token_hash`, `replaced_by_token_hash`, `revoked_at`, `expires_at`,
**`user_agent`**, **`ip_address`**.
**Subject:** every signed-in user.
**Why:** rotating sessions (ADR 0003) and reuse detection — a replayed token revokes the
whole family.
**Category:** authentication, plus **`ip_address` and `user_agent` are identifying and
behavioural**: together they are a per-session device-and-location history. They are set on
every sign-in and every rotation (`src/modules/auth/auth.service.ts:144-145, 206-207`) from
values the controller reads off the request (`auth.controller.ts:101-102`).
**Deleted by:** **nothing.** `RefreshTokensRepository.purgeExpired`
(`src/modules/auth/refresh-tokens.repository.ts:66`) exists and **`grep` finds no caller** —
no cron, no `@Cron`, no startup hook. The expiry sweep the schema comment describes
("drives the expiry sweep") is not wired up. An account that has been used for a year holds
a year of IP addresses. Revocation sets `revoked_at`; it does not remove the row.
**Retention:** `TODO(institution)`.

### `password_reset_tokens` — `password-reset-tokens.ts`

`token_hash`, `expires_at`, `consumed_at`.
**Subject:** any user who used the reset form.
**Why:** self-service reset for an active account. The raw token is never stored — SHA-256
only, the same pattern as `refresh_tokens`.
**Deleted by:** nothing. `PasswordResetService.confirm`
(`src/modules/auth/password-reset/password-reset.service.ts`) sets `consumed_at` and leaves
the row. Spent and expired tokens accumulate permanently. The residual value is low (a hash
of a dead 32-byte random token) but the _fact and timing_ of each reset is a behavioural
trace of one named user.

### `invitations` — `invitations.ts`

`address` (contact, identifying), `role`, `scope_type`, `scope_id`, `invited_by_id`,
`token_hash`, `expires_at`, `accepted_at`, `accepted_user_id`.
**Subject:** the invited person, who **may have no account and may never have consented to
anything** — the institution asserted their address.
**Why:** a deferred role assignment (ADR 0016, ADR 0018).
**Deleted by:** nothing. Acceptance sets `accepted_at`; expiry sets no flag and removes
nothing. **An invitation to an address that was never claimed sits in the table for ever,**
and it is the clearest case in the schema of personal data about a non-user.
`invited_by_id` is `set null` on the inviter's hard delete, which is unreachable.
**Retention:** `TODO(institution)`.

### `role_assignments` — `role-assignments.ts`

`user_id`, `role`, `scope_type`, `scope_id`, `valid_from`, `valid_until`.
**Subject:** every member of an institution.
**Why:** authorization. `student` and `teacher` are derived from a programme membership and
a teaching assignment respectively and are not grantable by hand (ADRs 0015-0018).
**Category:** identifying — the set of roles a person holds is a description of their
position in the institution.
**Deleted by:** soft delete, via `RoleAssignmentsService`
(`src/modules/authorization/role-assignments.service.ts:134`); cascade from `users`.

## The academic record

This is the high-value half. Everything here is _academic_ category, keyed to a named
person, and none of it can be erased through the API.

### `program_memberships` — `enrollments.ts`

`user_id`, `program_id`, `status` (`active` / `interrupted` / `graduated` / `terminated`),
`study_year`, `started_at`, `ended_at`.
**Subject:** students.
**Why:** it is what makes somebody a student; the `student` role derives from it.
**Sensitivity note:** `interrupted` and `terminated` are the disciplinary- and
welfare-adjacent values in this schema. A row saying a named person's studies were
terminated in a given year is a judgement about them, not a fact about a course.
**Deleted by:** soft delete; cascade from `users` or `programs`.

### `enrollments` — `enrollments.ts`

`user_id`, `course_offering_id`, `program_id`, `status`, `requirement_type`, `attempt`,
`enrolled_at`, `withdrawn_at`, `lms_provisioned_at`, `lms_provisioning_error`.
**Subject:** students.
**Why:** the course record. `attempt` is the retake counter, so the row carries the history
of failing and re-taking a course.
**Deleted by:** soft delete; cascade from `users` or `course_offerings`. A withdrawal sets
`withdrawn_at` and the status, deliberately keeping the record.
`lms_provisioning_error` is a free-text column that can capture arbitrary upstream text.

### `official_course_results` — `course-results.ts`

`enrollment_id` (→ the student), `status`, `attempt`, `calculated_points`,
`calculated_grade`, `proposed_grade`, **`proposed_by_id`**, `proposed_at`, `official_grade`,
**`official_recorded_by_id`**, `official_recorded_at`, **`conflict_note`** (free text).
**Subject:** the student for the grade; the **teacher and registrar** for
`proposed_by_id` / `official_recorded_by_id`, which are staff-performance data about who
graded what and when.
**Why:** the official grade, staged calculated → proposed → official.
**Sensitivity:** the highest in the system. `status` includes `disputed`, `annulled` and
`corrected`; the unique index is on `(enrollment_id, attempt)`, so **a resit is a second row
and the failure that caused it is retained beside it, by design**. `conflict_note` is
unconstrained free text attached to a disputed or corrected grade and is where a dispute's
substance — possibly including health or misconduct — will be written.
**Deleted by:** cascade from `enrollments`; otherwise soft delete. Annulment is a status,
not a deletion: `isVoidedResult` makes the grade stop counting, and the grade value stays in
the column.
**Retention:** `TODO(institution)`. Academic transcripts typically carry a statutory
retention far longer than anything else here, and that number must come from the institution.

### `exam_registrations` — `scheduling.ts`

`user_id`, `exam_term_id`, `status` (`registered` / `cancelled` / `attended` / `no_show` /
`excused`), `registered_at`, `cancelled_at`.
**Subject:** students.
**Why:** the seat and the attempt. `attended` and `no_show` consume an attempt; `excused`
does not (`consumesExamAttempt`).
**Sensitivity:** `no_show` and `excused` are attendance judgements about a named person, and
**`excused` is the field most likely to be set on health grounds** — which would make it
Art. 9 data by inference even though no reason column exists. `TODO(institution)`: decide
whether an excusal reason will ever be recorded, and if so, where. (Per `STATUS.md`, nothing
sets `no_show` or `excused` today; publishing a grade marks the seat `attended`.)
**Deleted by:** soft delete; cascade from `users` or `exam_terms`. A cancellation is kept
beside the record rather than erased — the partial unique index only covers
`status = 'registered'`.

### `exam_terms` — `scheduling.ts`

`examiner_id` → a named teacher. Identifying, staff. `set null` on the examiner's hard
delete; otherwise soft delete.

### `teaching_assignments` — `academic-structure.ts`

`user_id`, `role` (`lecturer`, `examiner`, …), `is_primary`. Identifying, staff — it is what
makes somebody a teacher. Soft delete; cascade from `users` or `course_offerings`.

### `study_group_memberships` — `enrollments.ts`

`user_id`, `study_group_id`. Academic — which seminar a named student sits in, and therefore
who they sit with. Soft delete; cascade from `users` or `study_groups`.

## The learning half

Defined in `learning.ts`. These tables exist and have no creation surface yet (Phase 2 of
`Product Plan.md`), but the schema is live and the demo seed writes to it.

| Table                  | Personal fields                                                                                  | Category                                                                         | Deleted by                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------- |
| `assessment_results`   | `user_id`, `points`, `normalized_score`, **`feedback`** (free text), `graded_at`, `graded_by_id` | academic; `feedback` is free text about a named student; `graded_by_id` is staff | cascade from `users` / `assessments`; soft delete |
| `activity_completions` | `user_id`, `state`, `completed_at`                                                               | **behavioural** — per-activity engagement tracking                               | cascade from `users`; soft delete                 |
| `submission_refs`      | `user_id`, `state`, `attempt`, `submitted_at`, **`is_late`**, `url`, `file_count`                | **behavioural** — a lateness record per submission                               | cascade from `users`; soft delete                 |

`activity_completions` and `submission_refs` together are the closest thing in the system to
surveillance data: they record, per student per activity, whether and when they engaged and
whether they were late. They are the tables a "monitoring" objection under Art. 21 would be
about.

## Notifications

### `notification_events` — `notifications.ts`

`payload` jsonb, typed `NotificationPayload`: `grade`, `previousGrade`, `attempt`,
`enrollmentStatus`, `reason`, plus scheduling fields. No `user_id`.
**Why:** one row per thing that happened, deduplicated per institution on
`type:subjectId:day` (`dedupeKeyOf`, `notification-emitter.types.ts:45`).
**Sensitivity:** **a grade value is stored here a second time, outside
`official_course_results`.** `GradeNotificationsService.published`
(`grade-notifications.service.ts:39`) writes `{ grade, attempt, previousGrade }` into the
payload. The row is institution-scoped, not user-scoped; the link to the student is
`notification_deliveries`. Reads go through `my-notifications.repository.ts`, which joins on
the delivery — but the grade itself sits in a row whose unique key is the _result_ id.
`reason` is free text on a refusal.
**Deleted by:** soft delete; cascade from the offering / exam term / activity it points at.

### `notification_deliveries`

`user_id`, `read_at`. **Behavioural** — `read_at` is a read receipt, evidence that a named
person opened a specific notification at a specific time. Soft delete; cascade from `users`
or the event.

## Prospective customers

### `demo_requests` — `demo-requests.ts`

`institution_name`, `contact_name`, `email`, `role`, **`message`** (free text),
`status`, `submission_count`, `last_submitted_at`, **`ip_hash`**, **`user_agent`**.
**Subject:** a prospective-demo requester — not a user, not a member of any institution.
This is the one table with no `institution_id`.
**Why:** `POST /api/v1/demo-requests`, behind `@PublicFormThrottle()`. `ip_hash` and
`user_agent` exist to recognise a repeat abuser.
**Category:** identifying, contact, and free text of unknown content.
**`ip_hash` is a bare unsalted SHA-256 of the address** (`demo-requests.service.ts`,
`hashIp`). The comment says "not enough to be an address on file"; that is only half true —
the IPv4 space is 2^32, so an unsalted digest is reversible by exhaustive search in seconds.
Treat `ip_hash` as a pseudonymised IP address, which is still personal data (Recital 26),
not as anonymised data.
**Deleted by:** nothing. `status` moves to `contacted` or `archived` and the row stays. There
is no admin surface to remove one.
**Lawful basis and retention:** `TODO(institution)` — a lead captured from a public form is
the one purpose here plausibly resting on consent or legitimate interest rather than on the
institution's public task.

## Tables with no personal data

`institutions`, `institution_settings`, `org_units`, `academic_terms`, `programs`,
`courses`, `course_offerings`, `rooms`, `timetable_events`, `study_groups`,
`learning_spaces`, `learning_activities`, `assessments`. These hold institutional structure
only. Note that `timetable_events` becomes personal by join — it links a room and a study
group, and `study_group_memberships` names who is in that group — so a timetable is an
attendance-location record for the students in it.

## Non-table stores

### Application logs — Pino, `src/common/logger/logger.module.ts`

`nestjs-pino` with `pinoHttp`. Redaction is configured and covers:
`req.headers.authorization`, `x-api-key`, `proxy-authorization`, `cookie`, `set-cookie` on
both request and response, and `req.body.password`, `req.body.token`, `req.body.refreshToken`.
Health checks are excluded from autologging.

What still reaches the log:

- **Every request line**: method, URL and the remote address, by `pino-http` default. URLs
  in this API carry user, enrolment and result **UUIDs** — pseudonymous identifiers, not
  anonymous ones.
- `req.body` is **not** redacted wholesale — only three named fields. A body containing
  `email`, `displayName`, `address`, `message` (demo request), `conflictNote` or `feedback`
  is logged in full at whatever level `pino-http` is configured for.
- Named user ids in application logs: `auth.service.ts:116`
  (`{ userId }`, "refresh token reuse detected") and `email.processor.ts:35,49`
  (`{ userId }`, welcome and password-reset sends).
- `AllExceptionsFilter` logs `{ err, requestId, code }`
  (`src/common/filters/all-exceptions.filter.ts:126`). The `err` object on a database error
  can carry the offending SQL parameters, i.e. field values, into a 500-level log line.
- 401/403/429 are logged at `warn` deliberately, so a burst of failed sign-ins for an
  address is visible — which is the point, and also a record of attempts against a named
  account.

**Retention and destination of logs: `TODO(institution)`.** Nothing in the repository ships
logs anywhere; in development they go through `pino-pretty` to stdout.

### Redis — `src/common/redis`, `src/app.module.ts`

Three things live in Redis, none of them encrypted at rest by this code:

1. **Idempotency entries** (`src/common/idempotency/idempotency.interceptor.ts`). Keyed
   `idem:<userId>:<method>:<url>:<key>` — **so the key itself contains the user id and the
   request URL** — and the value for a completed request is the **full serialised response
   body**. For an enrolment or a grade write, that is the academic record, cached in Redis
   for `idempotencyTtlMs`. This is the largest personal-data footprint outside PostgreSQL.
2. **Throttle counters** (`ThrottlerStorageRedisService`, `app.module.ts:125`), key-prefixed
   with the queue prefix. `@nestjs/throttler` keys on the client address, so these are short-
   lived IP-derived records.
3. **Distributed locks** (`distributed-lock.service.ts`), `lock:<key>`. No caller exists
   today, so no personal data is in them.

`RefreshTokensRepository` state is in PostgreSQL, not Redis — sessions are not cached.

### BullMQ — `src/queue`

One queue, `email`, prefixed `{<QUEUE_PREFIX>}` in the same Redis. Two job schemas in
`src/queue/jobs/email.jobs.ts`:

- `welcome`: `{ userId, email, displayName }`
- `passwordReset`: `{ userId, email, resetToken, expiresAt }` — **the `resetToken` is the raw
  secret**, the one value the `password_reset_tokens` table deliberately refuses to store.

Job retention is set in `QueueModule.forRoot`: `removeOnComplete` after 1 hour or 1,000 jobs,
`removeOnFail` after **24 hours** or 5,000 jobs. So a failed password-reset job keeps a live
reset token and an email address in Redis for up to a day, and the token's own TTL is one
hour (`RESET_TTL_MS`), meaning the job outlives the secret it carries by 23 hours.

**Mitigating fact:** `grep` for `enqueueEmail` finds **no callers**. Nothing enqueues a job
today; `EmailProcessor` logs `'sending welcome email'` and sends nothing, and
`PasswordResetService.request` returns the token in the response body in non-production and
`{}` in production. The exposure is latent, not live — but it becomes live the moment the
mail transport TODO in `email.processor.ts` is filled in.

### Access tokens

`TokenService.issueAccessToken` (`src/modules/auth/token.service.ts:32`) puts
`{ sub, email, locale, role, tokenVersion }` into the JWT. **A JWT is signed, not
encrypted**, so the email address is readable by anyone who obtains the token. The frontend
BFF houses it in an `httpOnly` cookie (`frontend/src/shared/config/session.ts:45`,
`frontend/src/shared/auth/auth-route.ts`) and never returns it to the browser's JavaScript.

## What is missing

Not risks yet — those are in `DPIA.md` — but facts about the code:

- **No audit log.** `grep -i audit` across `src` returns three comments and no table. There
  is no record of who read a student's grades, who changed a role assignment, or who
  exported anything. `official_course_results` records who _proposed_ and who _recorded_ a
  grade, and that is the whole of the accountability trail.
- **No erasure path.** `DELETE /users/:id` soft-deletes. `/me` exposes `GET` and `PATCH`
  only (`src/modules/users/me.controller.ts`). Nothing implements Art. 17.
- **No export path.** Nothing implements Art. 15 or Art. 20; a subject access request would
  be answered by hand against this document.
- **No retention job.** `@nestjs/schedule` is registered (`ScheduleModule.forRoot()`) and
  nothing is scheduled. `purgeExpired` is dead code.
- **No rectification trail.** A corrected grade is a status change with a free-text note; who
  requested the correction is not recorded.
