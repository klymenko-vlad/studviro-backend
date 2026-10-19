# 0042 — Uploads are scanned by ClamAV before anything names them

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
- **Synchronous, inside `confirm()`.** The object is streamed from the store to clamd before
  the row naming it is written. An infected object is deleted and the request answers 409
  `FILE_INFECTED`; nothing is recorded. There is no "being scanned" state for anyone to
  see: a file either was accepted clean or was never accepted.
- **Fails closed.** With scanning on, an unreachable or refusing clamd answers 503
  `MALWARE_SCAN_UNAVAILABLE` and the upload can be retried. The object stays; if it is
  never claimed, the orphan sweep removes it.
- **Off by default.** `MALWARE_SCAN=off` keeps development and CI free of a 1 GB service;
  `MALWARE_SCAN=clamav` with `CLAMAV_HOST`/`CLAMAV_PORT` turns it on. `docker compose
--profile scan up clamav` runs one locally (`clamav/clamav-debian`, which also builds for
  arm64).

## Consequences

- Bytes now pass through the API once, on confirm, as a stream; ADR 0027's "the API does no
  file I/O" no longer holds for a scanning deployment. Memory stays flat; the request takes
  as long as the scan, about a second for a 10 MiB file.
- clamd's default `StreamMaxLength` is 25 MiB, below `STORAGE_MAX_UPLOAD_BYTES` (64 MiB). A
  larger file is refused as unscannable (503) until clamd's limit is raised to match.
- ClamAV's detection rate is below commercial scanners'. It catches known malware and test
  signatures; it is a floor, not a guarantee.
- Files uploaded before scanning was turned on are not rescanned.
