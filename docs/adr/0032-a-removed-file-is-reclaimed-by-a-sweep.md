# 0032 — A removed file's object is reclaimed by a sweep, not by the request that removed it

Status: accepted
Date: 2026-09-21

## Context

Removing a learning material tombstones its row and left the object in the bucket. Only
`PersonalDataErasureService` ever called `StorageService.delete`, so every file a teacher
ever removed was still stored, and still billed, for ever. Nothing in the product restores
a removed material, so the object was not being kept for any reason — it was simply never
dropped.

Two shapes were available.

**Delete inside `remove`.** The request that tombstones the row also deletes the object.
Simple, immediate, and it matches what the user just asked for.

**Sweep it later.** The request tombstones the row; a scheduled job drops the objects of
rows tombstoned longer ago than some window.

## Decision

**A nightly sweep at 04:00, after a grace period of `STORAGE_RECLAIM_AFTER_DAYS`
(default 30).** `StorageReclamationService` finds tombstoned `file` materials whose
`deleted_at` is older than the window and whose `storage_key` is still set, deletes each
object, then clears the key.

The key doubles as the record of what has been reclaimed. A row whose key is null has had
its object dropped; there is no second column and no second state to keep consistent.

A delete that fails is counted and logged, and its row **keeps its key**, so the next
night tries it again. One unreachable object does not stop the rest of the batch.

## Why not delete in the request

Deleting in the request forces a choice between two bad answers when the store is briefly
unreachable: fail the user's delete, which makes an unrelated outage look like a broken
button, or swallow the error and leak the object anyway — which is the bug this ADR
exists to fix, reintroduced at a lower rate.

It is also irreversible the instant it is clicked. There is no restore in the product, but
a row can be un-tombstoned by hand; an object cannot be un-deleted. The window is an
operational grace period for exactly that, not a retention policy, which is why it needs
no number from the institution and is not a `TODO(institution)`.

## What this does not cover

**An abandoned upload.** A ticket issued, the object `PUT`, and the row never written —
the object belongs to nothing, so a sweep driven by the database cannot find it. Nor can a
bucket lifecycle rule: an abandoned object sits under the same
`institutions/<id>/materials/` prefix as a live one, so a prefix-and-age rule would delete
real coursework. Reclaiming those means listing the bucket and checking each key against
the database. It is recorded in `docs/Deployment.md` and left undone.

**Submission files.** Nothing soft-deletes `submission_files` today — erasure hard-deletes
the rows and already drops their objects — so there is no orphan to reclaim on that side.
If a withdraw-my-submission action is ever added, it belongs in this sweep.

## Consequences

- A removed material costs storage for up to `STORAGE_RECLAIM_AFTER_DAYS` and then stops.
- **Object versioning would defeat this.** A delete against a versioned bucket writes a
  delete marker and keeps the object as a noncurrent version. If the institution turns
  versioning on, it must set a noncurrent-version expiry rule beside it.
- The sweep is per-process. One instance running it is enough; several would race on the
  same rows and lose only on the duplicate delete, which S3 treats as a success.
