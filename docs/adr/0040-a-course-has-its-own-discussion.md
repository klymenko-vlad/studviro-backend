# 0040 — A course has its own discussion

Status: accepted
Date: 2026-10-18

## Context

The only messages StudViro carried were notifications from the system and the note and
feedback attached to a submission. Students of a course had nowhere to ask each other or
the teacher anything; at UKF that happens in Moodle forums or Microsoft Teams, outside the
system that holds the course. The thesis assignment asks for communication with classmates.

Direct messages between any two people would be the larger and riskier design: an inbox
across the institution, harassment that no teacher sees, and personal data with no course
to scope it. A conversation that belongs to one course offering has an obvious audience, an
obvious moderator and an obvious end.

## Decision

- **One discussion per course offering**, made of threads; a thread is a title plus posts,
  the first post being the opening message. All text a person wrote is therefore in
  `discussion_posts`.
- **Who:** whoever teaches the offering or administers offerings moderates; whoever is
  enrolled (a participating enrolment) reads and writes; everyone else is refused, the
  same stance `LearningAccessService` already gives course spaces. A thread is addressed
  through its offering, so it cannot be read through another course's URL.
- **Moderation is reversible and recorded.** A teacher hides a post or a whole thread and
  can restore it; each act writes `discussion.hidden` or `discussion.restored` to the audit
  trail in the same transaction. A hidden post keeps its place and shows no text to
  students, its author included; a hidden thread disappears for them and takes no replies.
- **Deleting is the author's alone**, and immediate: the text is overwritten, the row stays
  so the replies around it keep their order and read as answering something.
- **Notifications are named, never broadcast.** A new thread reaches the teachers; a reply
  reaches the people who already posted in the thread. Replies to one thread on one day
  fold into one notification (ADR 0012).
- **Personal data (ADR 0030):** the export carries every post the person wrote; erasure
  overwrites their posts and the titles of threads they opened and reports the count.
- **No reactions or real-time updates.** Plain text, at most 10,000 characters,
  refetched on demand. Amended 2026-10-19: edits (below) and attachments came later.
  A post carries up to three files of at most 10 MiB, of the kinds coursework accepts,
  uploaded through a discussion ticket. Only a key issued for this institution's
  discussion is accepted, so a submission's key cannot be re-published to the course. A
  hidden post's files are withheld with its text; deleting the post or erasing its
  author deletes them.

## Consequences

- A conversation outside any course (study groups, a whole year) has no home. That is
  deliberate for now.
- ~~Editing a post is not possible.~~ Amended 2026-10-19: an author edits their own post
  (`edited_at`, shown as _edited_) and the title of a thread they started. Nothing a
  teacher has hidden can be edited until it is restored, so a taken-down post cannot be
  quietly rewritten. No edit history is kept: the moderator sees the current text, and a
  history would be one more copy of personal data to erase.
- Rate limiting is the global per-IP throttle; nothing is specific to posting.
- ~~A thread is one flat list of posts, read whole.~~ Amended 2026-10-23: a post may
  answer another (`replyToPostId`). Answering a top-level post gathers the answer under
  it (`parent_post_id`); answering a reply keeps the answer in the same group and quotes
  the reply (`quoted_post_id`). Groups are one level deep, so a long exchange stays
  readable on a phone. A quote shows the start of the quoted text under the same rules
  as the post itself: nothing of a deleted post, and nothing of a hidden one for anybody
  who cannot restore it. A deleted or hidden post cannot be answered. Threads, top-level
  posts and the replies of each group are keyset-paged, and threads filter by title.
