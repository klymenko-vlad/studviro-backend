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
