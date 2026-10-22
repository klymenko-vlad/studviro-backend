# 0017 — Institution creation names an existing account, not an invitation

Status: accepted
Date: 2026-09-12

## Context

ADR 0016 settled the shape of authority: a platform operator (`users.role = 'admin'`) may
create an institution and "send that institution's first `institution_admin` invitation",
under the flat `RolesGuard`, never the canonical `PermissionsGuard`. It did not settle what
`POST /institutions` actually accepts, because the `invitations` table it also designs —
institution, address, the role to grant, a token, `expires_at` — is step (d), not yet built.

Step (c) needs `POST /institutions` to ship now, closing G6 and the SQL-only tenant creation
it names. Building it against an `invitations` table that does not exist yet would mean
either blocking step (c) on step (d), or building a throwaway version of invitations twice.

## Decision

`POST /institutions` takes `firstAdminUserId`: the id of an **existing** account, which
becomes the institution's first `institution_admin` in the same transaction as the
institution row. No address, no token, no email is sent. The caller — the platform
operator — is responsible for knowing which account they are naming; today that means asking
the person to register first and share their account id, which is exactly as manual as it
sounds.

This is deliberately the smallest thing that closes G6: it removes the SQL requirement, and
it is subsumed rather than replaced when step (d) lands. Once `invitations` exists, institution
creation can accept an email instead and create a pending invitation in the same
transaction; `firstAdminUserId` stays valid for the case where the operator already knows the
account.

Org-unit read (`GET .../org-units[/:id]`) and the person directory (`GET .../people`) are
both gated on `role:read` at institution scope, the same permission that already gates
`GET .../role-assignments` — they exist to support the grant screen's scope and subject
pickers, so they carry the same audience rather than a new permission.

## Consequences

- A platform operator must still coordinate out-of-band with whoever becomes the first
  administrator — this ADR does not claim to close B2, only to remove the SQL step.
- The person directory enumerates derived roles institution-wide
  (`DerivedRolesRepository.findAllForInstitution`), which is the institution-wide read step
  (b) deliberately deferred. Per-person derived-role lookup
  (`GET .../role-assignments?userId=`) is unchanged and still cheaper for that one case.
- When step (d) ships, `POST /institutions` gains an email-based path; `firstAdminUserId`
  is not deprecated, since a platform operator naming an already-registered account is a
  real, faster case worth keeping.
