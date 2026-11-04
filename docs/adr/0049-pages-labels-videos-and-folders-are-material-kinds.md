# 0049 — Pages, labels, videos and folders are material kinds

Status: accepted
Date: 2026-10-24

Step CB5 of `docs/Course Builder Plan.md`. Builds on ADR 0028 (materials are their own
table), ADR 0027 (uploads) and ADRs 0043–0048 (the outline and its rules).

## Context

A material was a file, a link or a short note. Moodle has four more resources a course
page is built from: a **page** (a long formatted text with a page of its own), a **label**
(a line of text between items), an **embedded video**, and a **folder** of several files.
Every rule built since CB1 — visibility, windows, restrictions, groups, completion, the
student view — had to keep holding for them.

## Decision

- **Four new values of `learning_material_kind`**: `page`, `label`, `video`, `folder`
  (migration `0039`). They stay rows of `learning_materials`, so every rule from ADRs
  0043–0048 applies unchanged: `AvailabilityService` decides them, the outline orders them,
  the student view lists them. No read path needed a kind-specific branch to stay closed.
- **A page is Markdown, stored as written, up to 100 000 characters.** It is left out of
  the outline list (its `body` is null there) and read whole by
  `GET …/materials/:id`, which answers 404 to anybody who may not open it and counts as
  opening it for a student (the rule _opened_ completes). A note stays at 20 000.
- **Markdown is rendered on the client's server, never in the browser, and never as HTML.**
  The renderer is a small Server Component (`frontend/src/shared/markdown`), no dependency:
  headings, paragraphs, lists, emphasis, inline and fenced code, quotes, rules and links. It
  builds React elements, so raw HTML in the text is shown as text and there is nothing to
  sanitise after the fact; a link is kept only for `http`, `https` and `mailto`. A page has
  its own route, rendered by a Server Component; the form's preview goes through a Server
  Action. Neither puts the renderer in the client bundle. A Markdown or sanitiser library
  was not adopted: neither repository had one, and the subset a course page needs is
  smaller than either.
- **A label has no title of its own.** Its title is derived from its text (first line,
  80 characters) so restriction targets, the sight report and the group content list still
  have something to name it by; a title sent for a label is ignored. Its text is at most
  1 000 characters. Its completion rule can only be _none_ (`400
COMPLETION_RULE_NOT_APPLICABLE` otherwise), so it never enters progress, the completion
  table or the list of things a restriction can wait for.
- **A video is a YouTube or Vimeo address, normalised on the server** to the provider's
  privacy embed: `https://www.youtube-nocookie.com/embed/<id>` and
  `https://player.vimeo.com/video/<id>?dnt=1` (with `h=` for an unlisted Vimeo video).
  Watch, short, live, `youtu.be`, embed and channel addresses are accepted; anything else,
  including look-alike hosts and credentials in the URL, is `400
LEARNING_MATERIAL_VIDEO_UNSUPPORTED`. The client's CSP allows exactly those two frame
  origins (`frame-src`), and the client frames a stored address only if it is on one of
  them. The frame is lazy, titled and sandboxed. A video counts as opened when its frame is
  shown, as a note does — the player is cross-origin, so nothing better is observable.
- **A folder's files are a table of their own**, `learning_material_files`: up to 100 per
  folder, each uploaded with a material ticket and confirmed, scanned, downloaded and
  reclaimed exactly as a file material is. They are listed a page at a time and filtered by
  name. Adding and removing is for authors; downloading any file, or opening the folder in
  the outline, counts as opening the folder. A folder is created empty and filled by
  `POST …/materials/:id/files`, one file at a time, so there is one way in.
- **Storage.** The malware scan marks folder files with the other upload tables; the orphan
  sweep treats a folder file's key as referenced; the nightly reclamation drops a folder
  file's object once the file, or its folder, has been removed longer than the grace
  period. **Erasure keeps folder files**, as it keeps file materials: they are the course's,
  not the personal data of whoever uploaded them.
- **Editing.** A material's title and what its kind is made of — a note's, page's or label's
  text, a link's or video's address — can now be changed by `PATCH`; a file's object and a
  folder's files are changed by their own actions. An empty `PATCH` answers the material
  unchanged (it answered 500).

## Consequences

- A page in the outline carries no body; a client wanting it reads it by id.
- A video with a rule of _opened_ completes when a student sees the row, not when they
  press play.
- Markdown beyond the subset (tables, images, nested lists, HTML) is shown as typed. Images
  would need a storage-backed upload of their own and a widened `img-src`.
- Moving a file between folders, renaming a folder file and a folder-wide download are not
  built.
