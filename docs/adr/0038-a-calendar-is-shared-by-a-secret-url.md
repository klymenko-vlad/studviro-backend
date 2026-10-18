# 0038 — A calendar is shared by a secret URL

Status: accepted
Date: 2026-10-18

## Context

The calendar existed only inside StudViro. A student who keeps their week in Google
Calendar, Outlook or Apple Calendar had to copy every class, exam and deadline by hand, and
copy it again whenever a class moved or was cancelled. The thesis assignment asks for
integration with an external calendar.

A calendar application subscribes to a URL and polls it every few hours. It cannot sign in:
no bearer token, no cookie, no OIDC. Whatever proves who the feed belongs to has to be in
the URL itself.

## Decision

- **The URL carries a 256-bit random token**, `GET /api/v1/calendar-feeds/{token}.ics`.
  The route is public; the token is the credential. Only its SHA-256 is stored, in
  `calendar_feeds`, the same pattern as `refresh_tokens` (ADR 0003). The URL is therefore
  shown once, when it is created. A lost URL is replaced, not recovered.
- **One live feed per person per institution.** Creating a new one deletes the old row in
  the same transaction, so the old URL stops working at once. Turning the feed off deletes
  the row.
- **A feed answers only while its owner could read the calendar in the app.** Each poll
  checks that the account is active and still holds `schedule:read` in the institution. An
  unknown token, a suspended account and a lost role all answer the same `404`, so a
  guessed token learns nothing.
- **Content:** classes the person attends or teaches, exam terms they hold a seat on or
  examine, and their deadlines, from 14 days back to 78 days ahead (each source caps a
  read at 92 days). A cancelled class or exam stays in the feed with `STATUS:CANCELLED`,
  so a subscribed calendar removes it instead of keeping a stale copy. Times are written
  in UTC (`…Z`); the calendar app shows them in the reader's own zone. Labels follow the
  account's locale (English or Slovak).
- **The same calendar can be downloaded once** as `studviro.ics` from
  `GET /institutions/{id}/me/calendar.ics`, behind the normal session, for anyone who would
  rather import than subscribe.
- **Erasure deletes the feed** with the other credentials (ADR 0030).

## Consequences

- Anyone who obtains the URL can read the owner's timetable until the owner replaces it.
  That is the trade every calendar subscription makes; Google's own "secret address" is
  the same design. The page says so next to the URL, and replacing it is one click.
- The URL leaks through whatever the owner pastes it into. `Referrer-Policy: no-referrer`
  and `Cache-Control: private, no-store` keep it out of the two places the server
  controls.
- Feed URLs are built from `APP_URL`, so in production that must be the API's public
  `https` origin.
- No two-way sync. Changes made in Google Calendar are not written back; nothing here
  needs them.
