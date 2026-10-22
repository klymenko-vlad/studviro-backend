# 0016 — Administrative authority, derived roles and invitations

Status: accepted
Date: 2026-09-12

## Context

The platform carries two role systems that have never been told apart. `users.role` is a flat
`user | admin` enforced by `RolesGuard`, and it governs the old user endpoints; the eight
canonical roles are institution-scoped, resolved over the scope ancestry and enforced by
`PermissionsGuard`. Nobody has written down which question each answers, so the flat one is
treated as vestigial while it still guards a CRUD surface over every account in the database.

Three concrete holes come out of that silence. `role:assign` is checked at **institution**
scope on every route, so a faculty-scoped `org_unit_manager` cannot grant anything at all,
while an institution-scoped one may grant `institution_admin` — to themselves. `RoleAssignmentsService.grant`
validates the scope, the window and the duplicate, and never asks whether the caller is
entitled to the role they are handing out. And `student` is a role somebody has to type in, so
an import of five thousand people produces five thousand accounts with no permissions
(defect B2), while a student who withdraws keeps theirs.

## Decision

### Three tiers, and the top one holds no academic permission

**Platform operator** is `users.role = 'admin'`, kept and narrowed rather than deleted. It
exists to create an institution and to send that institution's first `institution_admin`
invitation. It is not in the canonical role enum, it never appears in a scope, and
`AuthorizationService` never consults it — a platform operator cannot read a grade, a roster or
a timetable. That boundary is the one the thesis claims to preserve, so it is enforced by the
guards being separate rather than by anyone remembering.

`RolesGuard` therefore survives on exactly two routes: `POST /institutions` and the connector
registry's platform-wide health. `UsersController`'s `@Roles('admin')` CRUD over every account
retires in favour of the institution-scoped person directory (G7); an operator with a list of
every human on the platform is a tier that has quietly grown an academic permission.

**Institution admin** holds the whole catalogue within one institution. **Scoped roles** are the
remaining seven over the existing ancestry. Nothing about that resolution changes.

### A role that canonical data already states is derived, not granted

`AuthorizationService.rolesIn` unions granted assignments with roles **derived** from the
academic model:

- an `active` `program_memberships` row derives `student` at institution scope;
- a `teaching_assignments` row derives `teacher`, except `assistant`, which derives
  `teaching_assistant`, at its course offering's scope.

`interrupted`, `graduated` and `terminated` derive nothing, so a student who leaves loses access
on the next import without anyone revoking anything. This is the single decision that closes
B2: an import now produces correctly-permissioned accounts with zero grants, and the grant
screen is left holding only the roles no source system expresses — registrar, the two
coordinators, `org_unit_manager`, `institution_admin`. Those are administrative appointments,
and an appointment is exactly the thing that should require a human to make it.

The alternative — having `PersonsImporter` write `student` role assignments — was refused. It
duplicates a fact the model already holds, in a second table, with its own drift, and makes
"why does this person still have access" a question with two answers.

The cost is two extra reads per authorization check. `rolesIn` is already per-request; it gains
a request-scoped memo keyed on (user, scope), which is the same fix the
configuration-read-per-call complaint in `STATUS.md` is waiting for.

### An invitation is a deferred role assignment

`invitations` holds institution, address, the `(role, scopeType, scopeId)` it will grant, the
inviter, the token digest, `expires_at`, `accepted_at` and `accepted_user_id`. Accepting it
creates an ordinary `role_assignments` row with `source_system = 'platform'`. One authority
model, one audit trail, and the invite screen is the grant screen with an address field instead
of a UUID.

It is created under `role:assign` **at the scope being granted**, not at the institution. That
single change is what makes a faculty-scoped `org_unit_manager` useful and an institution-scoped
one bounded, and it applies identically to `POST role-assignments`, which is the same authority
exercised on a person who already has an account.

### Two rules the grant path has never had

**You cannot grant a role you do not hold.** The set a caller may hand out at a scope is the
set of roles whose permissions are a subset of their own permissions there. An
`org_unit_manager` may appoint a coordinator or a registrar in their faculty; they may not
appoint an `institution_admin` anywhere, because they do not hold one. `institution_admin` is
the fixed point that may grant itself, which is what makes it the role a platform operator
hands out once.

**An institution is never left without an administrator.** Revoking, expiring or merging away
the last live `institution_admin` grant of an institution is refused. Without it, one careless
revoke turns a tenant into a row nobody can administer and only SQL can rescue.

### Roles the source system stated are not silently revocable

A derived role has nothing to revoke — the correction belongs in the enrolment or the teaching
assignment, and `enrollment:manage` already governs that. A granted assignment carrying
`source_system = 'sis'` may be revoked, but the revocation is recorded as a platform-authored
override rather than a soft delete, or the next import restores it and the administrator learns
that their decision does not stick. This is the same question step 48 has to settle for
reconciliation generally, and it should be settled once, in that ADR, for both.

## Consequences

- `student` disappears from the grant screen's role list, and the grant screen becomes an
  administrative-appointment screen. Existing hand-granted `student` rows become redundant
  rather than wrong; a migration retires the ones whose programme membership already derives them.
- Eight roles stay in the enum but only five are ever granted. That is honest: the enum
  describes what a person _is_ in a scope, and two of those facts now come from the registrar's
  system.
- Authorization gains a dependency on the academic model, which it did not have. The memo keeps
  it to one read per scope per request; without the memo the course page would pay for it.
- The permission catalogue is unchanged. Invitation reuses `role:assign` deliberately: a
  separate `invitation:manage` would let someone hand out an authority they cannot hand out
  directly, which is the escalation this ADR exists to close.
- Every guard decision now has two possible sources, granted and derived. `GET
institutions/:id/me/permissions` must say which, or an administrator debugging "why can this
  person see that" has no way to find out.
