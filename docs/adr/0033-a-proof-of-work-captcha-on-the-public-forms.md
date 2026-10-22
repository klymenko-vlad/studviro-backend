# 0033 — A proof-of-work captcha on the public forms, self-hosted

Status: accepted
Date: 2026-09-21

## Context

Four routes are reachable by anyone with the URL: sign-up, sign-in, the
password-reset request and the demo request. Each is rate-limited by IP, which
stops one address hammering the form and stops nothing else — a bot with a
handful of addresses walks past it, and the demo-request table fills with
whatever a scraper puts there.

The honeypot on the demo form catches the laziest of them. Nothing else did.

## The options

**Cloudflare Turnstile.** The mainstream free choice. It needs a Cloudflare
account and a site key, which is a credential the user has to obtain — against
the standing "no credentials are needed until deploy" rule — and it sends every
visitor's browser to Cloudflare before they can sign in.

**hCaptcha.** Free tier, same shape, same two problems, and its free tier shows
image puzzles to people who have done nothing wrong.

**ALTCHA.** A proof-of-work challenge, not a puzzle: the server hands the client
the SHA-256 of `salt + n` and the client finds `n` by hashing. Self-hosted, no
account, no site key, no request leaving the origin, nothing to pay.

## Decision

**ALTCHA's protocol, implemented rather than imported.** `CaptchaModule` issues
and verifies; `@RequireCaptcha()` with `CaptchaGuard` sits on the four routes.

**Why not Turnstile or hCaptcha.** Either would send every visitor to a US
processor before they can sign in to their own university. For an institution
that has to name its processors, that is a question to answer rather than a
default to inherit — and a captcha is the one control that fires for people who
are not logged in and have consented to nothing. The self-hosted one has no such
question. Turnstile remains the documented swap if an institution prefers it:
the guard is the only seam, and it is one method wide.

**Why implemented, not imported.** The server side is sixty lines of `node:crypto`
and the client side is a hashing loop. The official `altcha` web component is
~12 kB gzipped and the client bundle had 8 kB of headroom — adopting it would
have breached a budget whose own file says every reduction lever is spent.
Writing the protocol is also what makes the swap above cheap: the wire format is
ALTCHA's, so the official widget and libraries drop in unchanged.

**Off by default** (`CAPTCHA_ENABLED=false`). Development and the whole e2e suite
stay unchallenged; `captcha.env.ts` turns it on for the one suite that asserts
the guard refuses. Production refuses to boot with the shipped secret when it is
enabled — with that secret a caller signs their own solved challenge, which is
the entire check.

## How the verification avoids storing anything

The salt carries its own expiry and an HMAC proves this server minted the
challenge, so nothing is remembered between issuing one and seeing it back.

Two details that are load-bearing rather than incidental:

- **The signature is checked before the answer.** An unsigned payload is a
  forgery, and hashing an attacker's arbitrary salt before proving they did not
  choose it is work they picked for us.
- **The signature is compared in constant time.** It is the only thing between a
  caller and a challenge they minted; a `===` on a hex string leaks how much of a
  forgery was right.

**Single use does need memory.** Without it a caller solves once and replays that
payload for every attempt, which is exactly the attack. A Redis `SET NX` under
the challenge's own TTL is the claim, so the mark expires precisely when the
challenge does.

## Consequences

- A visitor spends up to a second of CPU per submission. A bulk sign-up spends
  it per account, which is the point.
- **No JavaScript means no sign-in** when this is on. The forms already require
  it, so nothing regresses — but it is now load-bearing rather than incidental.
- A very old browser without `crypto.subtle` cannot solve one. `crypto.subtle`
  requires a secure context, so this also means the app must be served over HTTPS
  wherever the captcha is enabled — which it must be anyway.
- The client's search is linear and single-threaded. At `CAPTCHA_MAX_NUMBER`
  above a few hundred thousand it would want a Web Worker; the default of 100,000
  is chosen to stay under that.
