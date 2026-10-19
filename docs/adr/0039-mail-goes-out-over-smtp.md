# 0039 — Mail goes out over SMTP, queued, after the data it describes is committed

Status: accepted
Date: 2026-10-18

## Context

The mail queue existed from the platform foundation, but its processor logged each job and
returned, and nothing enqueued a job anyway. Password recovery therefore worked only where
the API handed the token back (development), an invited registrar learned of the
invitation only if an administrator copied the link to them, and nobody was ever welcomed.
`Feature Status.md` had to call password recovery partial (tracker B37).

The provider is not decided. The institution may already run a relay, or may buy a
service such as Postmark, Amazon SES or Brevo. All of them speak SMTP.

## Decision

- **SMTP, through nodemailer, behind a `MailTransport` interface.** `MAIL_TRANSPORT=smtp`
  with `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` and
  `MAIL_FROM` picks any provider without a code change. `MAIL_TRANSPORT=log` (the default)
  sends nothing and logs recipient and subject only, never the body, which carries
  tokens.
- **Development catches mail in Mailpit** (`docker compose`, web inbox on port 8025), so
  nothing reaches a real inbox and no account is needed.
- **Three messages, each in Slovak and English:** password reset (the account's locale),
  invitation (the institution's default locale; the invitee has no account yet) and
  welcome after sign-up (the account's locale). Each is plain text plus HTML that says the
  same. Links point at `WEB_APP_URL`, the client's public origin.
- **Queued, never sent inline.** A slow or failing SMTP server delays a message and the
  queue retries it with backoff; it never fails or slows the request that caused it.
  A reset whose token expired while waiting is dropped instead of sent.
- **Queued only after the data is committed.** An invitation made inside institution
  creation is mailed after that transaction commits, so a rollback cannot leave a link to
  nothing. A failure to queue the welcome is logged and the sign-up succeeds; a failure to
  queue a reset or an invitation fails the request, because then the person would wait
  for a message that never comes.
- **Production refuses `MAIL_FROM` at its development default** when SMTP is on.
  Production is allowed to run with `log`: the deployment has no provider yet, and an API
  that refuses to boot helps nobody. `Deployment.md` says what that costs.

## Consequences

- Reset and invitation tokens sit in Redis inside the job payload until the job is
  removed (an hour after completion, a day after a final failure). Redis was already
  trusted with session challenges; it is not exposed.
- The SMTP provider becomes a GDPR processor for addresses and message content. Which
  one is the institution's decision (`TODO(institution)` in the inventory).
- Notification copies by mail (requirement F15) came later on the same transport, opt-in
  per type (ADR 0041).
