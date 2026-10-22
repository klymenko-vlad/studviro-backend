# Backup and Restore

The data that matters here is the academic record: grades, exam results, enrolments, the
official course results a student's transcript is drawn from. StudViro is the system of
record (ADR 0024), so there is no upstream to re-import from. A lost database is lost data.

Two scripts, both reading `DATABASE_URL`:

| Command                                | What it does                                                            |
| -------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm db:backup [directory]`           | `pg_dump --format=custom` to a timestamped file. Prints path and size   |
| `pnpm db:restore <dump> [--i-mean-it]` | `pg_restore --clean --if-exists` over the database `DATABASE_URL` names |

`db:restore` overwrites. It names the target database and makes you type that name back
before it does anything, and with `NODE_ENV=production` it refuses outright unless
`--i-mean-it` is passed as well. Both guards are deliberate: restoring over a live
database is the most destructive operation in this repository.

## What the institution must supply

None of the following is knowable from the code. Every row of this table is a
`TODO(institution)`; the two that decide the rest are spelled out under it.

| Unknown                | What is needed                                                                                                       | Why                                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Backup destination** | A path or bucket the scripts write to, and who pays for it                                                           | `BACKUP_DIR` defaults to a temp directory so nothing lands in the working tree. A temp directory is not a backup                            |
| **Schedule**           | How often `db:backup` runs, and from where — cron on the database host, the platform's own snapshot feature, or both | Nothing in this repository schedules anything. Today a backup exists only when a human runs the command                                     |
| **Retention**          | How many dumps to keep and for how long                                                                              | Neither script deletes anything. Without a retention rule the destination grows until the disk is full                                      |
| **Encryption at rest** | Whether dumps are encrypted, with what, and where the key lives                                                      | A custom-format dump is plaintext to anyone holding the file, and it contains every personal-data category in `docs/GDPR Data Inventory.md` |
| **Off-site copy**      | A second location in a different failure domain, and the transfer mechanism                                          | A dump on the same host as the database it came from does not survive the loss of that host                                                 |
| **Who may restore**    | The named people permitted to run `db:restore` against production, and the approval needed                           | There is no application permission for this — it is shell access to the database. The `--i-mean-it` flag is a speed bump, not authorization |
| **RPO and RTO**        | See below                                                                                                            | Everything above follows from these two numbers                                                                                             |

### RPO and RTO — `TODO(institution)`

- **RPO**, the recovery point objective: how much recently entered data the institution
  accepts losing. This is the backup interval. A nightly dump means a failure at 16:00
  discards a day of grade entry, which during an exam period is a day of academic record
  keyed in by hand and not recoverable from anywhere. Continuous archiving (WAL shipping,
  or the hosting platform's point-in-time recovery) is what buys an RPO under a day; the
  scripts here cannot.
- **RTO**, the recovery time objective: how long the institution accepts being down. The
  measured restore below is under a second, but that is the `pg_restore` step alone on a
  local machine with the dump already present. The real number includes noticing, deciding,
  fetching the dump from wherever it was put, provisioning a database, and confirming the
  restore is sound.

## What is backed up

`pg_dump` in custom format, whole database, no owner or privilege statements — so the dump
restores into a database owned by whoever is running the restore. That covers:

- Every table in `public` — 33 of them, the 25 canonical academic tables plus auth,
  notification and settings tables.
- Enum types, indexes, foreign keys, constraints and sequences.
- `drizzle.__drizzle_migrations`. This matters: `GET /health/ready` compares its row count
  against `drizzle/meta/_journal.json` and fails readiness when the database is behind
  (`docs/Deployment.md`). A restore that lost it would leave a fully populated database
  that never passes readiness.
- Soft-deleted rows. `deleted_at` filters reads, not storage — the rows are in the dump.

## What is not backed up

**Redis.** Nothing in either script touches it, and Redis is not the system of record for
anything. Losing it costs:

| What is in Redis          | Lost means                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| Idempotency records (24h) | A client retrying a write it already made is no longer recognised as a replay and can double it |
| Queued jobs (BullMQ)      | Unsent welcome and password-reset emails are simply never sent. Nobody is told                  |
| Rate-limit counters (60s) | Every budget resets, including the 10/min on credential endpoints                               |
| Distributed locks (30s)   | Two replicas can run one scheduled job at once, briefly                                         |

Sessions are **not** in Redis: refresh tokens are a PostgreSQL table, so signed-in users
survive a Redis wipe and do survive a database restore — with the dump's tokens, not the
ones issued since.

Also not covered:

- **Uploaded files.** There is no file storage yet; when the S3-compatible `StorageService`
  of Phase 2 lands, the bucket needs its own backup and this document needs a section.
- **Secrets.** `.env`, JWT secrets, database credentials. A dump restored with no
  environment to run against is not a recovery.
- **The dump's own integrity over time.** Neither script verifies an old dump. A dump is
  only known good once it has been restored, which is why the drill below exists.

## Running one

```
pnpm db:backup                      # writes to ${TMPDIR:-/tmp}/studviro-backups
pnpm db:backup /srv/studviro/dumps  # or an explicit destination
```

To restore, point `DATABASE_URL` at the database to overwrite — a scratch one, to
rehearse — and pass the dump:

```
DATABASE_URL=postgres://studviro:studviro@localhost:5432/studviro_restore_drill \
  pnpm db:restore /tmp/studviro-backups/studviro-20260919T102706Z.dump
```

It prints the target and waits for the database name to be typed back. In a script, set
`CONFIRM_RESTORE` to the database name instead; with no terminal and no `CONFIRM_RESTORE`
it refuses rather than proceeding unattended.

**The client must not be older than the server.** `pg_dump` aborts on a server newer than
itself, which on a machine with the Ubuntu default client (16) and this project's
PostgreSQL 17 container it always is. Set `PG_CONTAINER` and both scripts run the client
inside that container instead:

```
PG_CONTAINER=backend-postgres-1 pnpm db:backup
```

## The drill

A backup nobody has restored is a hope. Run on 2026-09-19 against this machine's
development database — PostgreSQL 17.10 in `docker compose`, 10,173 rows across 33 tables
after `pnpm db:seed`. The dump was restored into a scratch database,
`studviro_restore_drill`, created for the purpose and dropped afterwards. **The `studviro`
database was read and never written.**

| Step                                                                     | Measured                    |
| ------------------------------------------------------------------------ | --------------------------- |
| `pnpm db:backup`                                                         | **0.240 s**                 |
| Dump size                                                                | **576,653 bytes** (564 KiB) |
| `pnpm db:restore` into the empty scratch database                        | **0.405 s**                 |
| `pnpm db:restore` again, over the now-populated one (the `--clean` path) | **0.459 s**                 |

What was compared afterwards, `studviro` against `studviro_restore_drill`:

| Check                                             | `studviro` | Restored  |
| ------------------------------------------------- | ---------- | --------- |
| Tables in `public`                                | 33         | 33        |
| Indexes                                           | 96         | 96        |
| Enum types                                        | 24         | 24        |
| Foreign key constraints                           | 80         | 80        |
| `drizzle.__drizzle_migrations` rows (journal: 22) | 22         | 22        |
| Row count, per table, all 33                      | identical  | identical |
| `users`                                           | 176        | 176       |
| `enrollments`                                     | 1,154      | 1,154     |
| `timetable_events`                                | 3,744      | 3,744     |
| `official_course_results`                         | 576        | 576       |
| `assessments`                                     | 345        | 345       |

Row counts alone would not catch corrupted values, so the full content of those five
tables was hashed — `md5(string_agg(row::text, '|' order by row::text))` — and each hash
matched. The second restore, over a populated database, produced the same hashes again, so
`--clean --if-exists` genuinely replaces rather than merges.

The guards were exercised too, and all three refused: `NODE_ENV=production` without
`--i-mean-it`, an unset `DATABASE_URL`, and a mistyped confirmation.

### What the drill did not prove

- **Scale.** 576 KiB of seeded demo data. A real institution's database is orders of
  magnitude larger and the restore time will not be half a second.
- **Transfer.** The dump never left the machine. Fetching it from an off-site destination
  is untimed and, since no destination has been chosen, untested.
- **The application against the restored database.** The comparison was done in SQL. The
  API was not booted against `studviro_restore_drill` before it was dropped.
- **An old dump.** The dump restored was minutes old. Nothing here shows that a dump taken
  six months ago still restores into the schema of the day it is needed — migrations move,
  and an old dump restores its own old schema. `pnpm db:migrate` afterwards is part of any
  restore from an aged dump, and is itself untested.
