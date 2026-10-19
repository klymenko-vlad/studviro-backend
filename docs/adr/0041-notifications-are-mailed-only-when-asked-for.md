# 0041 — Notifications are mailed only when asked for

Status: accepted
Date: 2026-10-19

## Context

Notifications lived only in the application (ADR 0039 left requirement F15 open). A
student who does not open StudViro for a week learns about a moved exam from a classmate.
Mailing every notification would answer that and bury everyone else: a teacher of three
courses hears about every reply in every discussion.

The emitter runs inside the transaction of the change it reports. A mail queued there is
sent even when that transaction rolls back, for a grade that was never published.

## Decision

- **Opt-in per notification type, per person.** `notification_email_preferences` holds one
  row per type a person wants by mail; no row, no mail. The choice belongs to the account,
  not to an institution: one mailbox, one setting, edited under `/account/settings`
  through `GET`/`PUT /users/me/notification-preferences`.
- **A sweep, not a mail at emission.** Every minute a sweep claims the deliveries whose
  copy is due (`for update skip locked`, so two replicas never take the same row), marks
  them `emailed_at` and queues one `notification` mail each. It reads committed rows only,
  which is what keeps a rolled-back change silent.
- **Due means still unread after a delay.** `NOTIFICATION_MAIL_DELAY_S`, five minutes by
  default. Someone who saw the notification in the application gets no mail about it.
- **At most one mail per delivery.** A folded event re-opens its delivery as unread but
  `emailed_at` stays set, so the same day's repeats are not mailed again.
- **No back-fill.** Only deliveries made after the type was turned on, and none older than
  a day: a sweep that was down for a week does not send a week of stale news.
- **The mail says what the in-app card says**: the same title per type, the course, what it
  is about, the time on the institution's clock, and a link to the notification list. Each
  copy says why it came and where to turn it off.

## Consequences

- The delivery is marked before its job is queued. If Redis is down at that moment the
  copy is lost rather than sent twice; the notification itself is still in the application.
- A person learns of something up to six minutes after it happened, not at once. For a
  moved exam or a published grade that is soon enough.
- Erasure deletes the choice, so nothing is mailed to an anonymised row.
