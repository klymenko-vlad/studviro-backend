# 0035 — An institution is joined only by invitation

Status: accepted
Date: 2026-09-24

## Context

An account reaches an institution only through an invitation, or by creating the
institution. A stranger who signs up has no way to ask for a place (tracker B2). There
were three readings. A stranger could send a join request that a registrar approves. Anyone
whose verified address matched a domain the institution lists could join as a student
automatically. Or the invitation could stay the only way in.

## Decision

**Invitation only, for now.** The institution decides who is in it and says so by
inviting them. A signed-up account with no invitation sees no institution. Nothing
lets it ask for one.

## Consequences

- There is no directory of institutions and no request queue. Nothing to moderate, and
  an institution's name is not shown to anyone it has not invited.
- A registrar who wants a cohort in must invite each person. The bulk-entry screen is
  the route for many at once.
- A join request with approval was the recommended alternative. It can be revisited
  without undoing anything here: it would add a table and a queue beside the
  invitation and change neither.
