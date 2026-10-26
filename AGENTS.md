# AGENTS.md

NestJS 11 · Fastify · Drizzle · PostgreSQL 17 · Redis 7. The client is `../frontend`.

## Delivery

- The loop from picking a step to marking it `Done` is the `ship-backlog-step` skill
  (`../.claude/skills/ship-backlog-step/SKILL.md`). Read it before feature work.
- "continue development" = run that loop for exactly one step.
- `docs/STATUS.md` is the entry point: what exists, what does not, what is next.
  `docs/Feature Status.md` is the product view, `docs/Task Tracker.md` the backlog status
  and the working agreement.
- Update all three in the same commit as the work that changes them. Rewrite affected
  lines; never append a changelog. STATUS.md stays under ~100 lines.

## Tests

Test-driven, always: failing test first, then the smallest change that passes it, then
refactor green. Cover positive, negative, boundary and failure cases. Test observable
behavior, not implementation. Reproduce every bug with a regression test before fixing it.

## Structure

- One exported concern per file. Two subjects means two files.
- Extract past ~150–200 lines, or a function past one screen. The extracted piece must be
  nameable without "and".
- Long files that only aggregate (schema barrels, route tables) are fine. Long files that
  reason are not.

## Lists

Every endpoint that returns a collection that grows with data is paginated and filterable:
`CursorPaginationQueryDto` (keyset, `limit` ≤ 100, opaque `cursor` from
`database/repository/cursor.ts`), a `q` text filter applied in SQL, and a
`CursorPageDto`-shaped response. Order by a total order with an id tiebreaker. Do not
return a whole collection, and do not cap one with a bare `LIMIT` the caller cannot page
past. The people directory (`people.repository.ts`) is the reference.

## Comments

Write none. Fix the code instead — rename, extract, tighten the type. No restatements, no
doc blocks, no rationale prose (that goes in `docs/adr/` or the commit message), no
banners, no `TODO`s, no commented-out code. Strip them from code you edit, too.

The one exception: a single line warning of something genuinely counter-intuitive that a
reader would otherwise break. More than one per file means you are still writing too many.
