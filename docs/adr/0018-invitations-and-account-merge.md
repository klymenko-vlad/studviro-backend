# 0018 — Invitations, accept-and-claim, merge, and the `POST /institutions` email path

Status: accepted
Date: 2026-09-12

## Context

ADR 0015 designed the token, the claim and the merge in prose but built none of it — step (a)
only shipped the schema an invitation needs to point at. ADR 0017 left `POST /institutions`
taking a raw `firstAdminUserId` because there was nothing else to give it, and said in its own
consequences that step (d) would grow an email-based path. Both are due now.

## Decision

### The token

An `invitations` row carries institution, address, the `(role, scopeType, scopeId)` it grants,
the inviter, `token_hash`, `expires_at`, `accepted_at` and `accepted_user_id`. It carries no
provenance columns — it is not synced data, the same choice already made for `refresh_tokens`.
The token is 32 random bytes, hex-encoded, hashed with SHA-256 and looked up by the hash exactly
like a refresh token: there is nothing to time an attacker into revealing, because the lookup is
an indexed equality on the hash, never a comparison against the stored value. It is never logged;
outside production the raw token rides back on the creating response instead (`devToken`), because
there is no mail transport to hand it to.

`POST /institutions/:id/invitations` sits behind `role:assign`, institution-scoped — deliberately
the same permission that gates a direct grant, not a new one. Inviting _is_ granting; the address
is only how the grant reaches someone who cannot yet be named by id.

### Accept-and-claim answers one way for three different failures

Unknown, expired and already-accepted all raise the same `INVITATION_TOKEN_INVALID`. A 404 for
"never existed" and a 409 for "already used" would each tell a caller holding a guessed token
which guess was closer; a single code and a single message closes that oracle, matching ADR
0015's requirement directly.

### Accept resolves one of three shapes, not one

The address may belong to nothing (a genuinely new person — the `POST /institutions` email path
lands here), to an `invited` shadow only (the ordinary imported-person case), or to both an
`invited` shadow and an already-active self-registered account (the merge case). Only the shadow
and the fresh-account paths need a password: an already-active account can already sign in, so
accepting only attaches the grant. `AcceptInvitationDto.password` and `.displayName` are optional
at the DTO layer and required by the service only when the shape in front of it needs them —
encoding that in three separate DTOs would not remove the branching, only relocate it.

### Merge is a fixed table list, not a schema walk

`MergeService` repoints `user_id` on `external_identities`, `role_assignments`,
`program_memberships`, `enrollments`, `teaching_assignments`, `exam_registrations`,
`study_group_memberships` and `notification_deliveries`, in the transaction that also
soft-deletes the shadow with `merged_into_user_id` set. `official_course_results` is
deliberately absent from the list: it hangs off `enrollments.id`, not `users.id`, so repointing
`enrollments.user_id` carries it forward for free. The nullable "who did this" attributions —
`official_course_results.proposed_by_id`/`official_recorded_by_id`, `exam_terms.examiner_id`,
`sync_runs.requested_by_id` — are unaffected on purpose: they record who acted, not who the row
is about, and a shadow import record is never the one who proposed a grade or ran a sync.

**Known limitation, accepted rather than solved here:** a unique-constraint collision — the
survivor already holds the exact row the shadow held, e.g. the same role in the same scope —
fails the whole accept transaction instead of silently keeping the survivor's copy and dropping
the shadow's. This is the safer failure (nothing is silently lost) but not the friendliest one;
resolving it needs per-table conflict rules that are not worth building before a real collision
is observed.

**Known limitation, also accepted:** `UsersRepository.findInvitedByEmail` is not scoped to the
inviting institution. Two institutions importing the same address before either invites it would
contend for one shadow row. Given the current single-tenant seed and connector setup this cannot
happen yet; scoping it properly needs a join through `external_identities` that is worth doing
once cross-institution overlap is a real scenario rather than a hypothetical one.

_Update 2026-09-23._ This limitation no longer has a way to occur. The only writer of an `invited`
shadow was the person importer, and ADR 0024 removed the import. An invitation now stores only an
address, and accepting it either takes over the one active account under that address or creates
one. Two institutions that invite the same address therefore grant two roles to one person, and
that is correct, because it is the same person. `findInvitedByEmail` can match only a shadow left
over from before the pivot, and each such row still belongs to a single address. Scoping the
lookup would need a column that nothing writes, so it was not built.

### Password reset reuses the invitation token shape, not a new one

`password_reset_tokens` is its own table — a reset proves nothing about institutional
membership, so it carries no grant and no institution — but the token itself is the same shape:
32 random bytes, SHA-256 digest at rest, single-use via `consumed_at`, one hour TTL (shorter than
an invitation's seven days, because a reset is time-boxed to one sitting rather than to "whenever
you get round to the email"). `POST /auth/password-reset/request` always answers `200` with the
same body shape whether or not the address resolves to an active account — the same
non-enumeration shape `demo-requests` already established for an unauthenticated public form.
Confirming revokes every refresh token and bumps `token_version`, so a compromised password
cannot be reset out from under a session the attacker still holds open.

Both routes carry `@PublicFormThrottle()`, not a new throttle tier: they are public-form writes
in exactly the sense that decorator exists for, and a second throttle mechanism would only be
a second thing to keep in sync with the first.

### `POST /institutions` gains `firstAdminEmail`, and keeps `firstAdminUserId`

`CreateInstitutionDto` accepts exactly one of `firstAdminUserId` or `firstAdminEmail` — validated
in the service, not the DTO, because "exactly one of two optional fields" is a cross-field rule
`class-validator` expresses awkwardly. `firstAdminUserId` grants immediately, in the same
transaction that creates the institution, to an account that already exists — unchanged from ADR 0017. `firstAdminEmail` creates an `institution_admin` invitation at institution scope in that
same transaction instead, for an address that may not have an account yet. Neither is deprecated:
a platform operator who already knows the account id has no reason to route through an email
round trip just because one now exists.

## Consequences

- `PersonsImporter` is unaffected: the shadow it creates is exactly what accept-and-claim expects
  to find by address, unchanged from step (a).
- A future admin screen for "invite a person" and "resend/revoke an invitation" needs
  `GET .../invitations` and a revoke endpoint; neither exists yet, because the step's user-facing
  requirement was "invite and accept," not "manage invitations," and adding either now would be
  scope this step does not need to ship.
- The grant screen's raw-UUID subject field is still not a picker sourced from the person
  directory (G7) — unrelated to this step, carried forward from step (c)'s note.
