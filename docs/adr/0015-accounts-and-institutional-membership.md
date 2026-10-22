# 0015 — Accounts, identities and institutional membership

Status: accepted
Date: 2026-09-12

## Context

Defects B1 and B2 are the same defect seen from two ends. `PersonsImporter` creates every
imported person with an argon2 hash of two random UUIDs, so nobody imported can ever sign in;
and if that person self-registered first, `IdentityLinkingService` throws
`IDENTITY_EMAIL_CONFLICT`, which holds the `persons` watermark back for ever because nothing
can resolve it. From the other end, membership of an institution _is_ holding a role
assignment, and only an administrator's grant screen — which takes a typed UUID — creates one.
A real university's first week would produce five thousand unreachable accounts and one
administrator who exists only because someone ran SQL.

The forcing case for the model is a person enrolled at two universities _at the same time_ —
a full-time student at one and an external-form student at another. Both lives are live in the
same week: two timetables, two exam periods, two inboxes, two institutional mailboxes. Any
design that makes this person hold two accounts makes them sign in twice to answer one
question about their Tuesday.

## Decision

### One account is one human; an institution is a dimension of the data

A `users` row is a person, not a person-at-an-institution. Everything institutional already
hangs off `institution_id` — role assignments, programme memberships, teaching assignments,
notifications — and `InstitutionsService.listForUser` already returns a list. We finish that
thought rather than reverse it: there is no account switching, because there is one account.
What switches is the **active institution**, carried in the route and remembered on the
account, with a switcher in the header beside the institution tab bar.

The rejected alternative is a per-institution `institution_people` table sitting between
`users` and the rest of the model. It is the textbook answer and it is what we would build
starting today, but it re-points a foreign key in twelve tables and every institution-scoped
repository with it. `external_identities` already carries the per-institution identity, which
is the part that actually has to be per-institution; the account does not.

The one surface allowed to union across institutions is the **calendar**, opt-in and badged per
event, because the dual-enrolled student's week is genuinely one week. Courses, grades, exams
and notifications stay scoped: two institutions share no term calendar, no grading scale and no
terminology, and a merged list would be lying about all three.

### An email address is a proven claim, not an identity

`user_emails` holds one row per address a person has _proved_ they control: user, address,
the institution that asserted it (null when self-added), `verified_at`, `is_primary`. It is
unique on the address among live rows, and that uniqueness is the whole defence — it is what
stops two humans racing for one institutional mailbox.

`users.email` survives as the display and primary address, but login resolves through
`user_emails`, so the dual-enrolled student may sign in with whichever address they remember.
An address never grants anything. Domain matching in particular grants nothing: `@unib.sk` is
a hint, not a proof, and treating it as one is how a tenant gets breached.

### A person record may exist without a credential

`users.password_hash` becomes nullable and `users.status` gains `invited | active | suspended`.
An imported person is `invited`: a real row that programme memberships and grades can point at,
which cannot sign in. The address the source system asserted for them is recorded on
`external_identities.asserted_email` — provenance-stamped, where it belongs — and _not_ in
`user_emails`, because the institution asserting it is not the human proving it.

This dissolves `IDENTITY_EMAIL_CONFLICT`. The importer resolves by (institution, issuer,
subject) as it already does; when that misses and the asserted address belongs to a live
account, it no longer throws and no longer fails the record. It creates the `invited` person,
records the asserted address, and the run advances its watermark. Whether that account and this
person are the same human is not a question an importer may answer.

### Claiming is proving control of the mailbox, and merging is one transaction

The human answers it. An invitation sent to the institutional address, or a sign-in through
that institution's IdP, proves control. If the accepting session already has an account, the
`invited` shadow is **merged** into it: every row referencing the shadow's id is repointed in
one transaction — external identities, role assignments, programme memberships, enrolments,
course results, exam registrations, teaching assignments, study-group memberships, notifications
— and the shadow is soft-deleted carrying `merged_into_user_id`, so the trail survives and the
next import lands on the surviving row through the identity it now owns.

Merge is the one genuinely dangerous operation in the system. It gets its own service, one
transaction, an audit row, and a test per referencing table; adding a table that references
`users.id` without extending it is a test failure, not a code review.

### Registration is always invitation-shaped

`/sign-up` no longer accepts a bare address and password. It accepts an invitation token and
then asks for exactly what it asked before — display name, password, locale — so a student
still experiences it as registering; what changed is that the institution decided first.
Invitations are covered by [0016](./0016-administrative-authority.md), which owns who may send
one and what it grants.

The token is 32 random bytes, stored as a SHA-256 digest like a refresh token, single-use,
seven-day TTL, bound to one address and one intended grant. Expired, consumed and unknown
tokens answer identically, because the difference is an enumeration oracle. Accepting while
signed in attaches to the current account and names it on the screen first; accepting while
signed out creates the account.

## Consequences

- There is no request-to-join and no account without an institution. A prospective applicant,
  or a teacher at a university not yet on StudViro, cannot have an account — the only way in is
  an administrator's invitation, and the first administrator of a tenant must come from the
  platform operator that 0016 defines.
- `users.email` stops being the identity. Every read of it as one — the access token payload,
  `UserResponseDto`, the importer's lookup — has to be re-read as "the primary display address".
- Password reset and email verification stop being optional. They were already missing; this
  design makes them load-bearing, since a claim is a verification.
- A merged-away account id may appear in an old link or an old log. Reads resolve
  `merged_into_user_id` forward rather than 404, once, at the repository edge.
- Nothing here makes an imported person a student. That is 0016's derived roles, and without
  them this design produces accounts that can sign in and see nothing.
