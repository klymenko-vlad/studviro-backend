# 0054 — A personal planner is private to its owner

Status: accepted
Date: 2026-10-26

## Context

The thesis assignment asks for an application that lets a student manage "academic
duties and everyday activities", with an overview of deadlines, tasks and the timetable.
Everything StudViro showed a student came from the institution: classes, exam terms and
assignment deadlines. A student could not write down anything of their own, so the
everyday half — a fee to pay, a book to return, training on Thursday — lived in another
app, the fragmentation chapter 1 of the thesis describes.

## Decision

- **Two tables, `personal_tasks` and `personal_events`**, each owned by one person in one
  institution. A task has a title, an optional note, an optional due time and a completion
  time; an event has a title, an optional note and place, a start and an end that must
  follow it (a check constraint and the service both refuse otherwise).
- **Private by construction.** Every route lives under `/institutions/{id}/me/…` and every
  read and write filters on the caller's own `user_id` and the institution in the path. No
  route takes another person's id, so no role — an institution administrator included — can
  read a planner. A task or event that is not the caller's answers `404`, the same as one
  that does not exist. The gate is `schedule:read`, the permission that already opens the
  calendar.
- **Tasks are a paged list; events are a window.** `GET me/tasks` is keyset-paged by due
  time (undated last, id as tiebreaker), filtered by state (`open` by default, `done`,
  `all`) and by `q` over title and note. `GET me/tasks/due` and `GET me/personal-events`
  answer a date range of at most 92 days, the same bound as every other calendar source,
  because the calendar asks for a week and the dashboard for two.
- **In the calendar and the feed as events.** A personal event is a `VEVENT`; an open task
  with a due time is a `VEVENT` at that moment titled "Task: …". `VTODO` was rejected:
  Google Calendar ignores it in a subscribed calendar and Outlook shows it only as a task
  list, so the person would lose the very entries they added. A finished or undated task is
  left out.
- **Soft delete for the owner, hard delete for erasure.** Deleting a task or event sets
  `deleted_at`, the codebase convention. Erasure (ADR 0030) hard-deletes both tables for the
  person, soft-deleted rows included: a private note has no retention argument. The export
  lists the live rows.

## Consequences

- The institution holds free text a student wrote for themselves. It is personal data with
  no academic purpose, listed in the GDPR inventory as such.
- There is no sharing, no recurrence and no reminder. A reminder before a due time is
  Phase 5 W11; recurrence would need its own rules and was not asked for.
- Personal items follow the calendar's feature flag: an institution that turns the timetable
  off hides the calendar page and, with it, the planner tab. The feed and the dashboard
  still carry them.
