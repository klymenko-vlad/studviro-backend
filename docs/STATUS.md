# Status

Handoff note for the next agent. Keep it under ~100 lines; trim rather than append.

Last updated: 2026-08-15

## What this is

A unified academic platform integrating a Student Information System (AIS2) and an LMS
(Moodle) behind one canonical model, so neither is hard-coded into the core. Full reasoning
in `docs/System Plan.md`; the 71-step backlog is in `docs/Tasks Plan.md` and its live status,
plus the working agreement for backlog work, in `docs/Task Tracker.md`.

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
- **Identity linking** (step 26) — `ExternalIdentitiesRepository` and `IdentityLinkingService`
  resolve a provider subject to a platform user: find by `(institution, issuer, subject)`, else
  provision a user with an unusable password. A shared email is never adopted silently — it
  raises `IDENTITY_EMAIL_CONFLICT` and must be linked deliberately through `link()`.
- **Scoped authorization** (step 27) — a permission catalogue mapped from `CANONICAL_ROLES`,
  a `ScopeHierarchyService` that walks org-unit ancestry to decide which grants enclose a
  target scope, `AuthorizationService.can/assert`, and `@RequirePermission` behind a
  `PermissionsGuard`. Institution scoping is enforced by `InstitutionScopedRepository`, which
  every canonical-table repository extends.
- **API contract** — `openapi.json` generated from decorators, committed, drift-checked by
  `pnpm openapi:check`; the frontend client is generated from it.
- **CI** — `.github/workflows/`: lint, typecheck, test, OpenAPI drift, migrations, build;
  plus pnpm audit, CodeQL and Trivy image scanning, release publishing and PR title/commit
  checks. `pnpm verify` is the same gate locally.

## Not done

Authorization and identity linking exist as services, but no HTTP surface uses them yet.

- No endpoints over the canonical tables beyond users, and no screens in the client for any of
  it. No seed data beyond users, and no way to grant a role through the API.
- No connectors (SIS or LMS), no synchronization engine, no institution configuration.
- The flat `user`/`admin` `RolesGuard` still governs the existing user endpoints; the two
  guards are orthogonal and `RolesGuard` should retire as canonical routes replace them.
- No OIDC strategy: `IdentityLinkingService` is the model an OIDC callback will call, but the
  strategy itself is blocked on institutional client registration.
- Theses, transcripts, notifications and audit are intentionally absent from the model.

## Next task — institution configuration and a mock SIS (steps 28–29)

- Institution configuration: per-institution terminology, locale and feature flags, read
  through a service rather than a config file, so a second synthetic university (step 64) is a
  data change.
- A deterministic mock SIS connector, which unblocks the synchronization engine without
  waiting on AIS2 access, together with the synthetic dataset in step 30.
- The first read endpoints over canonical data should carry `@RequirePermission` from day one
  and ship with the matching client screens — see the working agreement in
  `docs/Task Tracker.md`.

## Caveats

- `docs/Tasks Plan.md` and `docs/System Plan.md` are research output, not gospel. Prefer the
  codebase, `docs/Task Tracker.md` and current best practice where they conflict, and fix the
  doc when they do.
- Both docs contain broken citation markers (`cite…turn20view0`) — invisible private-use
  Unicode from a research export. They break exact-string edits; anchor edits on clean text.
- Steps 1–22 are design tasks whose status was inferred from the docs, not verified.
