# 0036 — A lapsed session is renewed before the page renders

Status: accepted
Date: 2026-09-25

## Context

The client keeps two httpOnly cookies: a fifteen-minute access token and a thirty-day
refresh token. The refresh cookie was scoped to `/api/auth`, so that a script forcing
requests could not make the browser send it anywhere else. Nothing else could send it
either. The page guard in `src/proxy.ts`, the server render and the API proxy all check
for a lapsed access token, and none of them ever saw the refresh token. Every session
ended when its first access token did, fifteen minutes after sign-in (tracker B47).

Moving the cookie was not enough on its own. A server render cannot write cookies. A
render that rotated the refresh token would lose the new one, and the next request would
present the spent one. The API reads a spent token coming back as a leak and revokes
every session the user has. The same thing happens when a page fans out: the document,
its prefetches and its data calls all leave the browser carrying the same cookie.

## Decision

- **The refresh cookie is sent on every path** (`/`), under a new name, `sv_refresh`.
  The old `sv_rt` at `/api/auth` is cleared on sign-out.
- **`src/proxy.ts` renews a lapsed access token before the page renders.** It writes
  the new pair into the response's cookies and into the request's own cookies, so the
  render reads the token the API will accept. A refused refresh ends the session and a
  protected page goes to sign-in. An API that cannot be reached is not an ended session:
  the page renders and its own data fetch reports the fault.
- **One rotation per refresh token per process.** `rotateRefreshToken` keeps the
  exchange in flight, and its answer for thirty seconds after, on `globalThis`, so the
  middleware and the Route Handlers (bundled separately) share it. Requests racing with
  the same cookie get the same successor.
- **The API refuses a token rotated in the last fifteen seconds without revoking
  anything** (`REFRESH_REUSE_GRACE_MS`). That covers the races one process cannot see,
  such as two instances of the client's server. A spent token that comes back later
  still ends every session.

## Consequences

- A session lasts as long as its refresh token, thirty days, instead of fifteen minutes.
- The narrow cookie path no longer limits a forced-request attack to the access token's
  lifetime. It never did in practice: the API proxy has to be able to renew a session,
  and a script that can force requests can force requests to the proxy. The cookie is
  still httpOnly, `SameSite=Lax` and first-party.
- A browser that signed in before this change holds only `sv_rt`, which nothing now
  reads. It is signed out once and signs in again.
- The shared rotation lives in one process's memory. **With more than one instance of
  the client's server**, the grace window is what keeps a race from revoking every
  session. The request that loses the race is refused, and its page sends the user to
  sign in even though the session survives. Sticky sessions, or a rotation lock in
  Redis, would close that. It is recorded in `Deployment.md`.
- The grace window gives a thief who replays a copy within fifteen seconds of a genuine
  rotation a plain refusal instead of the family revocation. They still get nothing.
