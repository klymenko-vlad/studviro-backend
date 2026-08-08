# 4. Keyset pagination for unbounded collections

- Status: accepted
- Date: 2026-08-08

## Context

`OFFSET n` makes Postgres walk and discard `n` rows, so cost grows with page
depth. It is also unstable: a row inserted while a client pages can shift every
later row across a page boundary, so items are skipped or repeated.

## Decision

`BaseRepository` offers both.

- `findPaginated` — offset-based, with a total count. For page-numbered admin
  screens over bounded tables.
- `findByCursor` — keyset over `(sortColumn, id)`, with an opaque base64url
  cursor. For anything user-facing, infinite-scrolling or unbounded.

The `id` tiebreaker is required in both: ordering by a non-unique column alone
leaves tied rows in an arbitrary order, which reintroduces the skipping that
keyset pagination exists to prevent.

Timestamp columns are stored at millisecond precision so a value can round-trip
through a cursor and still match the row it came from.

## Consequences

- Cursor pages cannot jump to page N. That is inherent, and acceptable for the
  scrolling case.
- `sortBy` resolves against a per-repository allowlist, so a caller-supplied
  column name never reaches SQL.
