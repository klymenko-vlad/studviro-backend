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

## Scraping

`GET /metrics`, version-neutral and outside the API prefix. It used to answer on
`/v1/metrics` — URI versioning applied to the controller while the prefix exclusion only
stripped `/api` — so a scrape configuration written before this change must be updated.

`METRICS_TOKEN` is mandatory in production and the scraper must send it as
`Authorization: Bearer …`. What to alert on, and at what threshold, is in
`docs/Observability.md`.

## First account

There is no seeding in production: `db:seed` refuses to run with `NODE_ENV=production` on
purpose. Create the first account through the client's `/sign-up` screen, which posts to
`POST /api/v1/auth/register`. Elevated roles are granted afterwards from the institution
roles screen.

## Object storage

Learning materials and student submissions live in an S3-compatible bucket, never on the
application's disk (ADR 0027). `docker compose` runs MinIO for development and CI; a
deployment points the same client somewhere real by changing these:

| Variable                    | Default             | Meaning                                                    |
| --------------------------- | ------------------- | ---------------------------------------------------------- |
| `STORAGE_ENABLED`           | `true`              | Turn the whole file half off                               |
| `STORAGE_BUCKET`            | `studviro`          | The bucket. It must already exist                          |
| `STORAGE_REGION`            | `auto`              | `auto` for R2; a real region for AWS                       |
| `STORAGE_ENDPOINT`          | unset               | **Unset for AWS.** Set for R2, MinIO or anything else      |
| `STORAGE_FORCE_PATH_STYLE`  | `true`              | `false` only for AWS S3                                    |
| `STORAGE_ACCESS_KEY_ID`     | `studviro`          | Must be changed in production or the app refuses to boot   |
| `STORAGE_SECRET_ACCESS_KEY` | `studviro`          | Likewise                                                   |
| `STORAGE_MAX_UPLOAD_BYTES`  | `67108864` (64 MiB) | Pinned into the presigned upload, so the store enforces it |
| `STORAGE_SIGNED_URL_TTL_S`  | `300`               | How long a read or write link lives. Capped at an hour     |

**Cloudflare R2**: `STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`,
`STORAGE_REGION=auto`, `STORAGE_FORCE_PATH_STYLE=true`. The credentials are an R2 API token
scoped to the one bucket — not an account-wide token.

**AWS S3**: leave `STORAGE_ENDPOINT` unset, set a real region, and
`STORAGE_FORCE_PATH_STYLE=false`.

**The bucket must be private.** Nothing in the application ever produces a public URL; every
read is a short-lived presigned `GET`. A bucket left world-readable would make every
submission in the institution public, and the application cannot detect that for you.

**CORS on the bucket is required**, because the browser uploads to it directly. Allow `PUT`
from the client's origin with the `content-type` header. Without it uploads fail in the
browser while working perfectly from a server, which is a confusing afternoon.

**`TODO(institution)`**: the bucket's lifecycle and retention rules, whether object
versioning is on, and whether uploads must be virus-scanned before a marker can download
them. ADR 0027 records that there is no scanner today and what the seam for one would be.
