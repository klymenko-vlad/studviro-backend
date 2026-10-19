# 0042 — Uploads are scanned by ClamAV in the background

Status: accepted
Date: 2026-10-19

## Context

ADR 0027 shipped storage with no virus scanning and said so. The content-type allow-list,
private buckets and forced downloads keep a file from being executed by the platform; they
do nothing for a malicious document a classmate or a teacher opens on their own machine.
Discussion attachments (ADR 0040) widened that: a file posted there reaches a whole course,
not one marker.

ADR 0027 named `StorageService.confirm()` as the one seam a scanner would need. Materials,
submissions and discussion attachments all pass through it before a row records the object.

## Decision

- **ClamAV, run by the institution next to the API**, reached over clamd's TCP `INSTREAM`
  command. It is free, it keeps files on the institution's own machines (a cloud scanning
  API would make a third party a processor of every submission), and the protocol is small
  enough to speak without a dependency (`clamd-client.ts`).
- **Asynchronous, after the upload is accepted.** `confirm()` checks size and type as before,
  then queues a `scanObject` job on the `media` queue and reports the file as `pending`.
  The row is written at once and the upload is as fast as without scanning. Each file row
  (material, submission file, discussion attachment) carries `scan_status`:
  `pending`, `clean`, `infected`, or `unscanned` when scanning was off at upload.
- **A pending file is usable.** It is listed and can be downloaded; the client shows it as
  not yet checked and asks before downloading it.
- **Infected means deleted.** The worker deletes the object and marks every row naming it
  `infected`. The row stays so the post or submission still says a file was there; its
  download answers 409 `FILE_INFECTED`.
- **The scanner may be down.** A failed scan leaves the file `pending`. A sweep every five
  minutes queues every pending file again (one waiting job per object), so when clamd
  answers again the backlog is scanned without anyone re-uploading.
- **Off by default.** `MALWARE_SCAN=off` keeps development and CI free of a 1 GB service;
  `MALWARE_SCAN=clamav` with `CLAMAV_HOST`/`CLAMAV_PORT` turns it on. `docker compose
--profile scan up clamav` runs one locally (`clamav/clamav-debian`, which also builds for
  arm64).

This replaces a first version, the same day, that scanned inside the upload request and
refused uploads while clamd was down. That kept unchecked files out entirely but made every
upload wait for the scan and stopped all uploads during a scanner outage.

## Consequences

- For a few seconds, or for as long as clamd is down, a file can be downloaded before it is
  checked. The client says so; whoever downloads it decides.
- Bytes pass through the worker once, as a stream, for the scan; the API itself still does
  no file I/O (ADR 0027).
- clamd's default `StreamMaxLength` is 25 MiB, below `STORAGE_MAX_UPLOAD_BYTES` (64 MiB). A
  larger file stays `pending` until clamd's limit is raised to match.
- ClamAV's detection rate is below commercial scanners'. It catches known malware and test
  signatures; it is a floor, not a guarantee.
- Files uploaded while scanning was off stay `unscanned`; they are not rescanned.
