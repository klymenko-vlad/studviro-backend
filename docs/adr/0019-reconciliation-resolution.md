# 0019 — Resolving a reconciliation discrepancy: source wins, or platform override

Status: accepted
Date: 2026-09-13

## Context

Step 37 shipped the read half of step 48: reconciliation fetches the whole source population,
compares it against the canonical rows that claim that source, and reports four kinds of
disagreement — `missing_in_platform`, `missing_in_source`, `stale` and `conflict`. It resolves
nothing, deliberately, because a report that quietly picks a winner hides the disagreement
instead of surfacing it.

That leaves an administrator looking at a list they cannot act on. Step 48's remaining half is
the write. The open question the backlog names is what a resolution _is_: a platform-authored
override stored as a new piece of state, or a decision that one side wins and is then applied to
the existing row.

## Decision

### Two verbs, not four

A resolution is one of exactly two actions, and the same two apply to every kind:

- **`accept_source`** — the source system is right. The platform yields.
- **`keep_platform`** — the platform copy is right. The row is overridden.

Per-kind verbs (`reimport`, `tombstone`, `detach`, `unflag`) were rejected: they describe the
mechanism rather than the judgement, and an administrator resolving a discrepancy is making one
judgement — which system to believe — not choosing an implementation.

### `keep_platform` is expressed by detaching the row, not by a flag

An override could have been a boolean column (`overridden`, `sync_frozen`) that every importer
must remember to honour. It is not. `keep_platform` sets the row's `source_system` to `platform`
and clears `external_id` and `source_version`.

This is self-enforcing. The importer already matches only on
`(institution_id, source_system, external_id)`, and tombstoning already scopes to
`source_system`. A detached row therefore falls out of the sync population by construction: no
future import can update it, overwrite it or tombstone it, and no future reconciliation run will
report it, because `listProvenance` never sees it. No new rule, no new column, nothing to forget.

The cost is honest and worth naming: if the source still offers that record, the next import
creates a _second_, source-owned row beside the kept one. That is the correct reading of an
override — the administrator asserted the platform's copy is a platform fact, so the source's
copy is a separate, source fact.

### `accept_source` clears the way; it does not fetch

`accept_source` on `missing_in_source` soft-deletes the row, which is complete on its own: the
source no longer offers the record, so there is nothing to fetch.

On `stale` and `conflict` it sets `synchronization_status = 'pending'` and nulls
`source_updated_at` and `last_synchronized_at`. The upsert's stale-write guard is
`source_updated_at is null or source_updated_at <= excluded.source_updated_at`, so a nulled row
is one the next import overwrites unconditionally — the guard that normally protects a newer
platform row is exactly what a resolution needs to stand down.

The resolution does **not** import, and it does not reset the domain's watermark. Resetting a
watermark to apply one row would re-read a whole domain, and importing inline would put a
connector round trip inside a request that is meant to settle a decision. Instead the response
carries `requiresFullSync`, and the client says so: resolve, then run a full synchronization.

### `missing_in_platform` is not resolvable here

There is no canonical row to accept or override — the resolution for "the source has it and we
do not" is an import. The endpoint rejects it with `RECONCILIATION_NOT_RESOLVABLE` and names the
full run as the remedy, rather than silently doing a targeted import that no other path offers.

### The decision is recorded

`reconciliation_resolutions` stores institution, source, connector, domain, kind, action, the
external and canonical identifiers, a server-written `detail` and who resolved it when. It is
institution-scoped and soft-deletable like every other table, and it carries no provenance
columns — it is a platform record of a platform decision, not synced data.

`canonical_id` has no foreign key on purpose: the row it names lives in whichever of twelve
canonical tables the domain maps to, and under `accept_source` on `missing_in_source` it has
just been tombstoned. The log must outlive what it describes.

### The permission is `sync:run`, not a new one

Resolving mutates canonical data on the strength of a synchronization judgement, which is what
`sync:run` already means; `sync:read` gates the report and the resolution log. Adding a
`sync:resolve` permission would have split one responsibility across two grants nobody would
ever hold separately.

## Consequences

- An administrator can settle a discrepancy from the sync monitor and see who settled the
  earlier ones. The report stops being a list of things nobody can act on.
- Overriding a row removes it from synchronization permanently and silently duplicates it if the
  source still offers the record. Reconciliation will not warn about this, because the kept row
  is no longer in its population. If that turns out to bite, the fix is a report of detached
  rows, not a flag on the importer.
- `accept_source` is a two-step operation for `stale` and `conflict`. Until there is a scheduled
  sync (G10), the second step is a button somebody has to press.
- A resolution is not undoable. Reversing a `keep_platform` means re-attaching the row by hand.
