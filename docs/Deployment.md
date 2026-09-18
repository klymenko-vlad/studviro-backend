# Deployment

Two hosted halves, one product. Both track `dev`.

| Half        | Where                                  | Serves                                  |
| ----------- | -------------------------------------- | --------------------------------------- |
| `backend/`  | Render, Docker image from `Dockerfile` | `https://studviro-backend.onrender.com` |
| `frontend/` | Vercel                                 | `https://studviro-frontend.vercel.app`  |

The client never calls the API from the browser. `NEXT_PUBLIC_API_URL` points at the
Render origin and every browser-side call goes through the same-origin BFF under
`/api/proxy` and `/api/auth`.

## Migrations are a deploy step, not a manual one

The runtime image is pruned to production dependencies, so `pnpm db:migrate` — which runs
through `tsx`, a devDependency — cannot run inside it. Use the compiled entrypoint:

```
pnpm db:migrate:prod    # node dist/database/migrate.js
```

`dist/` and `drizzle/` both ship in the image, so this works with nothing but
`DATABASE_URL` set.

**Render must run it as the service's Pre-Deploy Command.** Without that, a fresh database
serves a connectable-but-empty schema and every query fails with
`relation "users" does not exist` while `/health` still reports the database up. That is
exactly how this deployment spent several releases with no working sign-in.

## Readiness proves the schema, not just the socket

`GET /health/ready` now checks two things: the connection answers, **and** the count of
rows in `drizzle.__drizzle_migrations` is at least the number of entries in the journal
shipped in the image (`drizzle/meta/_journal.json`). An unmigrated or behind database
fails readiness, so the platform holds traffic instead of routing it into 500s.

Point Render's health check path at `/health/ready`, not `/health/live` — `live` only
proves the process is up.

## First account

There is no seeding in production: `db:seed` refuses to run with `NODE_ENV=production` on
purpose. Create the first account through the client's `/sign-up` screen, which posts to
`POST /api/v1/auth/register`. Elevated roles are granted afterwards from the institution
roles screen.

## The synchronization schedule

Off by default, because a deployment that has not chosen a cadence should not
acquire one by upgrading. Three variables turn it on:

| Variable                | Default       | Meaning                                                |
| ----------------------- | ------------- | ------------------------------------------------------ |
| `SYNC_SCHEDULE_ENABLED` | `false`       | Register the repeatable job at all                     |
| `SYNC_SCHEDULE_CRON`    | `0 3 * * *`   | When it fires                                          |
| `SYNC_SCHEDULE_MODE`    | `incremental` | `full` re-reads everything and applies `accept_source` |

One repeatable job serves the whole deployment: the handler fans out to every
institution with a connector configured, queueing a run per configured source
system. A run already in flight returns itself rather than queueing a second, so
a schedule that fires while yesterday's run is still going is harmless.

It must run where the workers do (`ROLE=worker` or `ROLE=all`). Registering it is
deliberately not fatal: a broker briefly unreachable at boot logs and starts
anyway, and the next deployment registers it again. Turning it off removes the
existing job rather than merely not adding one, so the last deployment that had
it on does not keep running it for ever.

A schedule is also what the write-back outbox needs: a `pending` intent whose
delayed job was lost waits for a human to press Retry without one.
