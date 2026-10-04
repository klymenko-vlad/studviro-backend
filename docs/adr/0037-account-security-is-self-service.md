# 0037 — Account security is self-service: sessions, password change, two-step verification

Status: accepted
Date: 2026-10-04

## Context

`/account` was read-only. A person could not rename themselves, change a password
without the forgot-password detour, see where they were signed in, end one of those
sessions, or protect the account with anything stronger than a password. "Sign out
everywhere" existed in the API and nothing called it.

Three things in the existing design shaped what was possible:

- A session was not a thing. Each refresh rotated into a new `refresh_tokens` row with
  nothing tying it to the sign-in it came from, and an access token knew only its user.
  Revoking one device's refresh token left that device's access token working for up to
  fifteen minutes.
- The BFF called the API with its own `fetch`, so every session was recorded against
  the Node server's user agent and address.
- `/api/proxy` forwards any API path with the session's bearer token. Any endpoint that
  answers with a token pair puts that pair in front of browser JavaScript.

## Decision

- **A session is a sign-in.** `refresh_tokens.session_id` is minted at sign-in and
  carried through every rotation, together with `session_started_at`. The access token
  carries it as `sid`. `JwtStrategy` checks that the session still has a live refresh
  token on every request, next to the token-version check it already made. Ending one
  session therefore ends its access token at once. Tokens minted before this have no
  `sid` and are checked as before.
- **`users/me/sessions`** lists live sessions (device, sign-in time, last rotation) and
  ends one or every other. The current session cannot be ended there; that is sign-out.
- **Changing the password ends every session, this one included,** and answers with a
  fresh pair. The BFF's `/api/auth/password` puts the pair into cookies, so the person
  stays signed in on this device only. The current password is required, and so is a
  different new one.
- **Two-step verification is TOTP (RFC 6238) plus ten single-use recovery codes.**
  - The secret is AES-256-GCM-encrypted under `TWO_FACTOR_SECRET_KEY`. Production
    refuses to boot with the shipped key.
  - Recovery codes are stored as SHA-256 digests. They carry 50 bits of entropy and sit
    behind the credential throttle, so a slow hash buys nothing.
  - The last accepted 30-second step is stored, so an observed code cannot be replayed.
  - Pairing, regenerating codes and turning it off all ask for the password again.
- **The second step is a challenge, not a half-session.** A correct password on an
  enrolled account gets `401 TWO_FACTOR_REQUIRED` with a challenge token in `details`.
  The challenge lives in Redis for five minutes, allows five codes, and is deleted by the
  one request that succeeds. A wrong password never reveals that the account has two-step
  verification on. `/api/auth/login` moves the challenge token into an httpOnly cookie
  scoped to `/api/auth/login`, so the browser never sees it.
- **`/api/proxy` refuses `api/v1/auth/*` and `api/v1/users/me/password`.** Every path
  that answers with tokens goes through `/api/auth/*`.
- **The BFF forwards the browser's `User-Agent`** on sign-in, registration, the second
  step, password change and every rotation. It does not forward the client's address:
  passing on a client-supplied `X-Forwarded-For` would let a caller choose the key the
  credential throttle counts by.
- **`ErrorResponseDto` documents `code`.** The filter always sent it. The client now
  branches on it rather than on the HTTP reason phrase.

## Consequences

- Every authenticated request costs one more indexed read
  (`refresh_tokens_session_id_idx`, partial on live rows).
- Changing `TWO_FACTOR_SECRET_KEY` makes every enrolled authenticator unreadable, so
  those people can sign in only with a recovery code. Rotation is a re-encryption job
  nobody has written.
- Session addresses are the BFF's. Showing a location, or counting the credential
  throttle per real client, needs the API to trust the BFF as a proxy hop. That is a
  deploy-shape decision, not made here.
- An erasure hard-deletes the two-factor secret and the recovery codes with the other
  credentials (ADR 0030). The tally reports both.
- No mail is sent on a password change or a new sign-in, because no mail is sent at all
  (tracker B37).
