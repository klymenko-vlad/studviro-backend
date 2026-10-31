# 0057 — One-click subscribe, and one calendar entry as a file

Status: accepted
Date: 2026-10-31

## Context

ADR 0038 gave a person a secret iCalendar URL and a whole-calendar download. Using the URL
still meant copying it, finding the "subscribe from URL" screen of the calendar app (each
hides it somewhere else) and pasting it. And there was no way to put _one_ exam or
deadline into a calendar without taking all of them. Phase 5 W9 asks for both.

## Decision

- **One-click subscribe is four links built from the URL just issued**: Google Calendar
  (`https://calendar.google.com/calendar/r?cid=<webcal URL>`), Outlook.com and Microsoft
  365 (`https://outlook.live.com/…/addfromweb?url=…` and the same on
  `outlook.office.com`, with `name=StudViro`), and `webcal://` for Apple Calendar and
  any other app that registers the scheme. They are built in the client, beside the URL,
  and open in a new tab with `rel="noopener noreferrer"`.
- **They appear only while the URL is on screen.** The server keeps only the URL's hash
  (ADR 0038), so a link that is already live cannot be offered again; a person who wants
  to subscribe another app later replaces the URL and subscribes everything again. Showing
  the buttons on a live feed would mean reissuing it, which silently breaks the existing
  subscriptions.
- **The secret goes only to the service the person clicks.** Nothing is sent anywhere
  until a button is pressed: no prefetch, no third-party script, no tracking parameter,
  and the subscribe links carry no referrer. The card says that only the chosen service
  receives the link.
- **One entry as a file is written by the server**:
  `GET /institutions/{id}/me/calendar-entries/{class|exam|deadline}/{entryId}`, behind
  the session and `schedule:read`, answering a one-event `text/calendar`
  (`studviro-event.ics`, `Cache-Control: private, no-store`). It reuses the feed's
  `toCalendarEntries` and `renderIcal`, so the event has the same UID, summary, place,
  `STATUS:CANCELLED` and locale as in the feed, and a calendar that holds both de-duplicates
  them.
- **Access is the caller's own calendar read.** The server looks up only _when_ the entry
  happens, then asks the same "my timetable / my exams / my deadlines" services the feed
  uses for that one millisecond, and keeps the entry only if it comes back. An entry the
  caller does not attend, teach or see (a restricted assignment, another course's class)
  answers `404`, the same as one that does not exist, as does a class while the
  institution has the timetable off, or an exam while exam registration is off. Looking it
  up by moment means an entry outside the feed's 14-back / 78-ahead window can still be
  downloaded.
- **An exam is offered only once the caller holds a seat on it or examines it** — the
  feed's own rule. An open term the student has not registered for is not in their
  calendar, so it is not offered as an entry either.
- **No Google or Outlook "create event" template links.** They would make a copy without
  the UID, so a moved or cancelled class could never update it; they would put the label
  and place text builders into the browser bundle a second time; and every one of those
  apps imports the `.ics` the button already downloads.

## Consequences

- _Add to calendar_ is on each class, deadline and registered exam in the calendar's list
  view, which is what phones open on. The week grid's blocks are links and cannot hold a
  second link, so on a wide screen it is one switch to _List_ away. The exams page and the
  dashboard do not carry it yet.
- Google Calendar and Outlook fetch the feed from their own servers, so one-click
  subscribe works only once `APP_URL` is a public `https` origin. Locally they open and
  report that the address cannot be reached.
- A downloaded entry is a snapshot. If the class moves, the copy does not, unless the
  person also subscribes the feed, where the shared UID replaces it.
- Choosing which kinds go into the feed, reminders (`VALARM`) and links back into
  StudViro are W10 and change the feed and this file together, since both use one builder.
