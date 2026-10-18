# Deployment

Two hosted halves, one product. Both track `dev`.

| Half        | Where                                  | Serves                                  |
| ----------- | -------------------------------------- | --------------------------------------- |
| `backend/`  | Render, Docker image from `Dockerfile` | `https://studviro-backend.onrender.com` |
| `frontend/` | Vercel                                 | `https://studviro-frontend.vercel.app`  |

The client never calls the API from the browser. `NEXT_PUBLIC_API_URL` points at the
Render origin and every browser-side call goes through the same-origin BFF under
`/api/proxy` and `/api/auth`. The one exception is a file upload, which goes straight to
the bucket (see `STORAGE_PUBLIC_URL` below).

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

## Calendar subscriptions

A student's calendar subscription URL is built from `APP_URL`
(`{APP_URL}/api/v1/calendar-feeds/{token}.ics`), and Google Calendar, Outlook and Apple
Calendar fetch it from their own servers. In production `APP_URL` must therefore be the
API's public `https` origin, not an internal hostname. Nothing else to configure (ADR 0038).

## First account

There is no seeding in production: `db:seed` refuses to run with `NODE_ENV=production` on
purpose. Create the first account through the client's `/sign-up` screen, which posts to
`POST /api/v1/auth/register`. Elevated roles are granted afterwards from the institution
roles screen.

## Object storage

Learning materials and student submissions live in an S3-compatible bucket, never on the
application's disk (ADR 0027). `docker compose` runs MinIO for development and CI; a
deployment points the same client somewhere real by changing these:

| Variable                     | Default             | Meaning                                                    |
| ---------------------------- | ------------------- | ---------------------------------------------------------- |
| `STORAGE_ENABLED`            | `true`              | Turn the whole file half off                               |
| `STORAGE_BUCKET`             | `studviro`          | The bucket. It must already exist                          |
| `STORAGE_REGION`             | `auto`              | `auto` for R2; a real region for AWS                       |
| `STORAGE_ENDPOINT`           | unset               | **Unset for AWS.** Set for R2, MinIO or anything else      |
| `STORAGE_FORCE_PATH_STYLE`   | `true`              | `false` only for AWS S3                                    |
| `STORAGE_ACCESS_KEY_ID`      | `studviro`          | Must be changed in production or the app refuses to boot   |
| `STORAGE_SECRET_ACCESS_KEY`  | `studviro`          | Likewise                                                   |
| `STORAGE_MAX_UPLOAD_BYTES`   | `67108864` (64 MiB) | Pinned into the presigned upload, so the store enforces it |
| `STORAGE_SIGNED_URL_TTL_S`   | `300`               | How long a read or write link lives. Capped at an hour     |
| `STORAGE_RECLAIM_AFTER_DAYS` | `30`                | How long a removed file's object outlives its row          |

## Two-step verification

Authenticator secrets are encrypted at rest (ADR 0037).

| Variable                | Default    | What it is                                                                          |
| ----------------------- | ---------- | ----------------------------------------------------------------------------------- |
| `TWO_FACTOR_SECRET_KEY` | dev        | Encrypts each authenticator secret. **Must be changed, or the app refuses to boot** |
| `TWO_FACTOR_ISSUER`     | `StudViro` | The name an authenticator app shows beside the code                                 |

Generate the key once (`openssl rand -base64 48`) and keep it. Changing it later leaves every
enrolled person with only their recovery codes. The second sign-in step keeps its challenge in
Redis, like the captcha.

## Captcha on the public forms

Sign-up, sign-in, the password-reset request and the demo request can carry a
proof-of-work captcha (ADR 0033). It is **off by default** and an institution turns it on
at deploy.

| Variable             | Default  | What it is                                                            |
| -------------------- | -------- | --------------------------------------------------------------------- |
| `CAPTCHA_ENABLED`    | `false`  | Turn it on. Everything below is ignored while it is off               |
| `CAPTCHA_SECRET`     | dev      | Signs each challenge. **Must be changed, or the app refuses to boot** |
| `CAPTCHA_MAX_NUMBER` | `100000` | The search space. Above ~500k the client wants a Web Worker           |
| `CAPTCHA_TTL_S`      | `600`    | How long a challenge stays solvable                                   |

Nothing to register, no account, no site key, no third party: the challenge is issued and
checked by this API. **It needs Redis** — single use is a `SET NX`, and without it a solved
challenge can be replayed for every submission.

**It needs HTTPS.** The client solves with `crypto.subtle`, which browsers only expose in a
secure context. Over plain HTTP the forms would fail with no way for a visitor to proceed.

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

**The client must name the bucket's origin too.** Its Content Security Policy allows no
cross-origin request except to `STORAGE_PUBLIC_URL`, a server-side variable on the Vercel
project: the same value as `STORAGE_ENDPOINT` for R2, the bucket's own URL
(`https://<bucket>.s3.<region>.amazonaws.com`) for AWS. Left unset, the browser refuses
every upload before it leaves the page, and the console names `connect-src`.

**A removed file's object is dropped by the application, not by the bucket.** A nightly
sweep at 04:00 deletes the objects of materials tombstoned longer ago than
`STORAGE_RECLAIM_AFTER_DAYS`, then clears the key it reclaimed. A failed delete keeps its
key and is retried the next night, so an unreachable store costs a day, not a leak.

**An abandoned upload is dropped by a second sweep, at 05:00.** An upload ticket whose
object was `PUT` but whose row was never written belongs to nothing, and it sits under the
same prefix as a live file, so a bucket lifecycle rule cannot tell them apart. The sweep
lists the bucket under `institutions/`. It deletes any object more than a day old that
neither a material nor a submission file points at. A tombstoned material keeps its key
until the 04:00 sweep takes it, so the 05:00 sweep never takes a file that can still be
restored. The credentials need `s3:ListBucket` on the bucket as well as object read,
write and delete.

**`TODO(institution)`**: whether object versioning is on — it would keep a reclaimed
object alive as a noncurrent version, which defeats the sweep unless a noncurrent-version
expiry rule is set beside it — and whether uploads must be virus-scanned before a marker
can download them. ADR 0027 records that there is no scanner today and what the seam for
one would be.

## Sessions across more than one instance of the client

The client renews a lapsed session in `src/proxy.ts` and shares one rotation per refresh
token across the process (ADR 0036). Run the Next.js server as **one instance, or with
sticky sessions**. Across several instances without either, two requests of one page can
rotate the same token. The API's fifteen-second grace window stops that from revoking the
user's sessions, but the request that loses is refused and its page sends the user to sign
in. A rotation lock in Redis would lift the constraint. Nothing needs configuring for one
instance.
