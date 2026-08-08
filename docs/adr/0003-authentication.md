# 3. Short-lived access tokens with rotating refresh tokens

- Status: accepted
- Date: 2026-08-08

## Context

The API is consumed by a Next.js BFF, not directly by a browser. It needs
sessions that can be revoked promptly without a database read on every request
being the only line of defence.

## Decision

- **Access tokens**: JWT, 15 minutes, sent as a bearer token. They carry
  `tv`, a copy of `users.token_version`.
- **Refresh tokens**: opaque to the client, stored only as a SHA-256 digest,
  rotated on every use. The superseding digest is recorded on the row it
  replaces.
- **Reuse detection**: presenting a token that was already _rotated_ means a
  copy leaked. Since which holder is the attacker is unknowable, every session
  for that user is revoked and `token_version` is incremented.
- **Explicit logout is not reuse**: a token revoked by sign-out has no
  successor, so replaying it is rejected without cascading. A client logging
  out with a refresh already in flight hits this routinely.
- Tokens are returned in the response body. The BFF re-issues them as
  httpOnly cookies on its own origin, which keeps CSRF out of the API.

## Consequences

- Revocation takes effect on the next request, not after the access TTL.
- `JwtStrategy` reads the user on every request. That is a deliberate cost:
  without it, `token_version` could not be enforced.
- Access and refresh tokens are signed with **different** secrets, and the env
  schema rejects a deployment that reuses one for both.
