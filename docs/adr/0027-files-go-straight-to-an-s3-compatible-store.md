# 0027 — Files go straight to an S3-compatible store, never through the API

Status: accepted
Date: 2026-09-19

Closes step L1 of `docs/Product Plan.md`, which gates the whole of Phase 2 — learning
materials, assignment briefs and student submissions all need somewhere to put bytes.

## Context

StudViro had no file storage of any kind. The Moodle half of the product is, in large part,
files: a lecturer uploads slides, a student uploads a submission, a marker downloads it
again. Nothing in Phase 2 can start without deciding where those bytes live and who may
read them.

Three things had to be settled: which store, how bytes get in, and how they get out.

## Decision

**An S3-compatible store, reached through one `StorageService`.** The product owner will use
Cloudflare R2 or AWS S3; both speak S3, as do Backblaze B2, Wasabi and MinIO. The client is
`@aws-sdk/client-s3` pointed at `STORAGE_ENDPOINT` — unset for AWS, set for everything else
— so moving between them is four environment variables and no code.

`docker compose` runs **MinIO** for local development and CI, with a one-shot `mc` container
that creates the bucket and exits. Nobody needs an account, a credit card or network access
to develop against storage, and CI does not depend on a third party being up. The images
come from `quay.io`, which is MinIO's own registry; the Docker Hub mirror is gated and
`docker pull minio/minio` fails with an access denial that reads like a typo.

**Bytes never pass through the API.** The server issues a presigned `PUT` and the browser
uploads directly to the store. Streaming a 64 MiB submission through a Node event loop, to
write it straight back out, spends the API's latency budget on every other request for no
benefit — and at the start of a submission deadline, that is exactly when the API is busiest.

**The presigned URL carries the constraints, so the store enforces them.** The content type
and a short expiry are signed in. A client that changes the content type is refused by the
store rather than trusted by us.

**The server confirms afterwards by asking the store what it received.** `confirm()` issues
a `HEAD` and checks the real size and the real content type before anything records the
object as a material or a submission. A client that promised a 2 MB PDF and wrote 80 MB of
something else is caught there, not believed.

**Reads are short-lived presigned `GET`s with `content-disposition: attachment` forced.**
Buckets are private; there is no public URL. The attachment header matters as much as the
expiry: it makes a browser download the file rather than render it on this origin.

**Content types are an allow-list, and `text/html` and `image/svg+xml` are not on it.** Both
execute script in a browser. A signed URL pointing at attacker-authored HTML served from the
platform's own origin is stored XSS with extra steps, and the attachment header is a second
line of defence rather than the only one.

**The institution id is the first path segment of every key**, and `StorageService` refuses
any read or delete whose key does not begin with the institution the caller is acting in.
The check sits in the service rather than in each caller, because forgetting it in one place
is all it would take. The key itself is a uuid; the uploaded filename survives only as a
trailing label, so two students uploading `assignment.pdf` do not collide and a name like
`../../etc/passwd` is not the store's problem.

## Virus posture

**There is no virus scanning, and pretending otherwise would be worse than saying so.**
What exists instead: an allow-list of content types, a size ceiling enforced twice, private
buckets with short-lived links, and forced download rather than inline rendering. Those stop
the file from being _executed by the platform_; they do nothing about a malicious document
opened on a reader's own machine.

A real answer is a scanner between upload and availability — ClamAV in the queue, or the
object store's own scanning where the provider offers it — with the object quarantined until
it passes. The queue and the confirm step are the right seams for it, and `confirm()` is
deliberately the single place that would have to change.

Superseded 2026-10-19 by ADR 0042: `confirm()` now streams each upload through ClamAV when
`MALWARE_SCAN=clamav`.

## Consequences

- Phase 2 is unblocked, and L2–L6 share one storage seam rather than each inventing theirs.
- The API does no file I/O, so an upload cannot exhaust its memory or its event loop.
- A signed read URL, once issued, is valid for its TTL even if the reader's session ends.
  Five minutes is the default; it is the shortest window that survives a slow connection.
- Nothing yet deletes objects when the row referencing them is deleted. Rows are
  soft-deleted throughout (see `docs/GDPR Data Inventory.md`, which notes that nothing in
  the system hard-deletes at all), so an orphaned object outlives its record. O4 —
  personal-data export and erasure — is where that is settled, and it must cover the bucket
  and not only the database.
