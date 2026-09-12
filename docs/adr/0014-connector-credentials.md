# 0014 — Connector credentials

Status: accepted
Date: 2026-09-12

## Context

Step 46 finishes admin connector configuration. Selection, health and capabilities already
ship on the institution settings screen; what is missing is the secret a real connector needs
to reach its source system. `mock-sis` needs none, so the question the step actually has to
settle is not "how do we store a Moodle token" but "what shape of storage and contract makes
the admin screen generic before the first real connector exists".

Two temptations had to be refused. The first is storing the credential in
`institution_settings` beside the terminology and the feature flags: that row is returned in
full by every configuration read, to anyone holding `institution:read`, which is every member
of the institution. The second is hard-coding the fields a connector needs into the screen,
which makes the screen Moodle-shaped and has to be rewritten for the connector after it.

## Decision

### A separate table, with its own permission

`connector_credentials` holds one row per stored field: institution, connector kind, connector
name, field key, ciphertext. It is institution-scoped and soft-deleted like every other table,
and it is unique on (institution, kind, connector, field) among live rows.

Keeping it out of `institution_settings` is the point. A credential is read by a different
audience, for a different reason, under a different permission than terminology and flags, and
a table that is never returned by a general configuration read cannot be leaked by one.

The permission is new: `connector:configure`, granted to `institution_admin` alone. It is
deliberately not folded into `institution:manage`, so that the ability to rename a term and the
ability to hold the key to the registrar's system stay separable.

### Encrypted at rest, never echoed back

Values are encrypted with AES-256-GCM under a key derived from `CONNECTOR_CREDENTIAL_SECRET`,
stored as a single self-describing string carrying its version, IV and authentication tag. The
version prefix is what makes a future key rotation a migration rather than a rewrite.

The API never returns a plaintext value, and never returns a masked stand-in either. It answers
whether a field is configured and when it last changed. A masked value is worse than no value:
it invites an admin to believe they are looking at the secret, and it tempts a client into
round-tripping it back on save.

### The connector declares its fields

`AcademicSystemConnector` and `LearningSystemConnector` each answer
`credentialFields(): ConnectorCredentialField[]` — key, label, description, whether it is secret
and whether it is required. The platform collects what the connector declares and nothing else;
a value for an undeclared key is rejected rather than stored.

This is what makes the screen generic. The admin UI renders a form from the descriptor list
without knowing which connector it is configuring, so adding a Moodle or AIS2 connector adds a
declaration, not a screen.

`mock-sis` declares one optional field it ignores. That is honest — it is documented as such in
the field's own description — and it is what lets the whole path be exercised end to end before
a connector that genuinely needs a secret exists.

## Consequences

- A credential is write-only from the outside. Recovering a lost one means setting it again;
  there is no read path to lean on, by design.
- `CONNECTOR_CREDENTIAL_SECRET` joins the JWT secrets as a value production must set. It has a
  dev-only default and production refuses to boot on it.
- Nothing consumes a stored credential yet. The service exposes decrypted values for the
  connector that will, but no shipped connector asks — the consumer arrives with the first real
  connector, which is blocked on institutional access.
- Rotating the derivation secret invalidates every stored value. Re-encryption under a new key
  version is not built; the version prefix only reserves the room for it.
