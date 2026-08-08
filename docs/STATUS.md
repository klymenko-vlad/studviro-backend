# Status

Handoff note for the next agent. Keep it under ~100 lines; trim rather than append.

Last updated: 2026-08-08

## What this is

A unified academic platform integrating a Student Information System (AIS2) and an LMS
(Moodle) behind one canonical model, so neither is hard-coded into the core. Full reasoning
in `docs/System Plan.md`; the 71-step backlog with per-step status is in `docs/Tasks Plan.md`.

## Stack

NestJS 11 on Fastify · Drizzle ORM + PostgreSQL 17 · Redis 7 (cache, BullMQ, throttle, locks)
· class-validator DTOs, Zod for env · generated `openapi.json` · Vitest + Testcontainers.
Client is Next.js 16 App Router (Feature-Sliced Design) and acts as the BFF, converting
platform tokens into httpOnly cookies. Decisions live in `docs/adr/`.

## Done

- **App skeleton** — modular monolith (ADR 0002), `ROLE=api|worker|all`, Zod-validated env,
  graceful shutdown, request timeouts, Helmet/CORS/compression/body limits.
- **Persistence infrastructure** — drizzle-kit migrations, `TransactionHost`-mediated
  repositories, keyset pagination (ADR 0004), soft-delete and ms-precision timestamp
  conventions in `schema/_shared.ts`.
- **Auth** — local credentials: argon2, 15-min access JWT carrying `token_version`, opaque
  refresh token stored as SHA-256 and rotated on use, with reuse detection (ADR 0003).
- **Async / integration plumbing** — BullMQ with a shared `BaseProcessor`, Redis distributed
  lock, `Idempotency-Key` interceptor.
- **Operations** — Pino logs with correlation IDs, Terminus health, bearer-protected Prometheus
  metrics in production, multi-stage `Dockerfile`, `docker-compose.yml`.
- **Canonical academic schema** (step 25) — 24 tables across institutions, identity linking,
  scoped roles, academic structure, enrolment, scheduling, learning and course results
  (ADR 0009). External IDs are never primary keys: every row carries `institution_id` plus
  provenance (`source_system`, `external_id`, `source_version`, `source_updated_at`,
  `last_synchronized_at`, `synchronization_status`), unique per
  `(institution_id, source_system, external_id)`. `Course`, `CourseOffering` and
  `LearningSpace` are separate. Grades are split into calculated / proposed / official.
- **API contract** — `openapi.json` generated from decorators, committed, drift-checked by
  `pnpm openapi:check`; the frontend client is generated from it.
- **CI** — `.github/workflows/`: lint, typecheck, test, OpenAPI drift, migrations, build;
  plus pnpm audit, CodeQL and Trivy image scanning, release publishing and PR title/commit
  checks. `pnpm verify` is the same gate locally.

## Not done

The tables exist; nothing reads or writes them yet.

- No repositories, services or endpoints over the canonical tables. No seed data beyond users.
- No connectors (SIS or LMS), no synchronization engine, no institution configuration.
- Authorization is still a flat `user`/`admin` `RolesGuard`. `role_assignments` is not enforced,
  and reads are not scoped by `institution_id` — nothing in the schema forces that today.
- No OIDC strategy. `external_identities` exists but nothing writes it.
- Theses, transcripts, notifications and audit are intentionally absent from the model.

## Next task — identity linking and scoped roles (steps 26–27)

The tables are there, so this is now module work rather than modelling.

- An `ExternalIdentity` repository and the linking rule: authenticate against a provider
  subject, find or create the platform user, never match on email.
- A scope-aware authorization guard that resolves `role_assignments` for the acting user and
  answers "may this person do X in scope Y", replacing the flat `RolesGuard`. Decide where
  `institution_id` scoping is enforced — repository base class or row-level security — and make
  it uniform before any read path exists to retrofit.
- OIDC strategy is optional and blocked on institutional client registration; the linking model
  should not assume it arrives.

Step 28 (institution configuration) and 29 (mock SIS) are the natural follow-ups, and 29
unblocks the connectors without waiting on AIS2 access.

## Caveats

- `docs/Tasks Plan.md` and `docs/System Plan.md` are research output, not gospel. Steps 26–27
  read as done but are not. Prefer the codebase and current best practice where they conflict,
  and fix the doc when they do.
- Both docs contain broken citation markers (`cite…turn20view0`) — invisible private-use
  Unicode from a research export. They break exact-string edits; anchor edits on clean text.
- Steps 1–22 are design tasks whose status was inferred from the docs, not verified.
