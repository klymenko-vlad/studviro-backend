# 0030 — Erasure anonymises the person and keeps the academic record

Status: accepted
Date: 2026-09-19

Settles the shape of step O4 of `docs/Product Plan.md` (personal-data export and erasure)
before it is built, because the wrong shape here is expensive to undo.

## Context

`docs/GDPR Data Inventory.md` and `docs/DPIA.md` both land on the same two gaps: a data
subject cannot get a copy of their data, and cannot have it erased. The inventory also
records the finding that makes the second one harder than it looks:

> **Nothing in this system ever hard-deletes.** `BaseRepository.hardDelete` has no caller
> outside refresh-token purging, every removal verb is `softDelete`, so no
> `onDelete: 'cascade'` in the schema has ever fired.

So "delete the user" would today set `deleted_at` and leave the email, the display name and
the argon2 digest in the row for ever. That is not erasure, and shipping it under that name
would be worse than shipping nothing.

Two things pull against each other. Article 17 gives a data subject the right to erasure.
Article 17(3)(b) and national education law give an institution the obligation, and the
lawful basis, to keep an academic record: a degree that can be revoked by deleting the
transcript is not a degree, and a university that cannot answer "did this person pass" is
not functioning.

## Decision

**Erasure anonymises the person and keeps the academic record.** It is not a deletion of
rows. Concretely:

- `users` — the email becomes an unroutable, unique placeholder, the display name becomes a
  neutral label, the password digest is nulled, and `token_version` is bumped so every
  outstanding access token dies immediately.
- Credentials and sessions — `refresh_tokens`, `password_reset_tokens`, `user_emails` and
  `external_identities` for that person are **hard-deleted**. These are the rows with no
  retention argument at all. So are this institution's `invitations` to them: the address
  an institution asserted about a person outlives an anonymised `users` row and hands the
  erased identity straight back, which is the one thing anonymisation is for.
- The academic record — `enrollments`, `official_course_results`, `exam_registrations`,
  `program_memberships`, `assessment_results` — **is kept**, still pointing at the now
  anonymous user row. The institution can still say a person with that student number
  passed that course; it can no longer say who they were.
- Free text a human wrote about the person — `conflict_note`, marking feedback — is
  cleared, because it is the one place where an identity survives anonymisation of the
  columns around it.
- Stored files belonging to the person — their submitted work, not the course's teaching
  materials — are deleted from the object store, and the `submission_files` rows naming
  them go with the objects rather than pointing at absences. ADR 0027 notes that nothing
  deleted from the store until now; erasure is where it starts.
- An `audit_events` row records that an erasure happened, by whom and when — **without the
  erased person's identifiers**. An audit trail that defeats the erasure it records is not
  an audit trail. `audit_events.subject_id` is not nullable, so the subject of the row is
  the erasure itself, under an id minted for it; the same id is what the caller is handed
  back, and it is the only handle anyone keeps on the event.

**Export is self-service and erasure is not.** A person may take a copy of their own data
whenever they like, over a route scoped to themselves. Erasure is a request the controller
acts on, because it is irreversible, because the controller has to weigh the retention
obligation, and because the person asking is not always the person the data is about.

**Erasure is institution-scoped, and refuses when it cannot be complete.** A user may belong
to several institutions. One institution may not erase a person another still has an active
relationship with; the request is refused and says so, naming the fact rather than the other
institution. Only when this is their last institution is the global `users` row anonymised
too.

**`hardDelete` gets its first real callers here, and a test that says so.** The inventory's
finding is closed by using it, not by adding a comment.

## Consequences

- An erased student's grades still count towards the institution's statistics, and their
  course still shows the right number of people who passed it. That is the point.
- Anonymisation is irreversible by design, so it needs the same confirmation posture as
  the restore script in `docs/Backup and Restore.md`.
- Export must cover the object store as well as the database, or it is a partial answer
  presented as a complete one.
- **`TODO(institution)`**: the retention period after which the anonymised academic record
  is itself destroyed, and who inside the institution is authorised to execute an erasure.
  Neither is knowable from the code.
- This ADR is written before the implementation deliberately. If the implementation cannot
  honour it, the ADR is wrong and should be amended rather than quietly diverged from.
