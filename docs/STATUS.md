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
- **API contract** — `openapi.json` generated from decorators, committed, drift-checked by
  `pnpm openapi:check`; the frontend client is generated from it.
- **CI** — `.github/workflows/`: lint, typecheck, test, OpenAPI drift, migrations, build;
  plus pnpm audit, CodeQL and Trivy image scanning, release publishing and PR title/commit
  checks. `pnpm verify` is the same gate locally.

## Not done

Everything domain-specific. The schema holds only `users` and `refresh_tokens`.

- No canonical academic tables — this blocks nearly everything else.
- No connectors (SIS or LMS), no synchronization engine, no institution configuration.
- Authorization is a flat `user`/`admin` `RolesGuard`. No canonical roles, no scoping.
- No OIDC strategy, no `ExternalIdentity` linking.

## Next task — canonical schema (backlog step 25)

The critical path. Steps 26 (identity linking), 27 (scoped roles), 28 (institution config),
29 (mock SIS) and 32–35 (connectors, sync) all need tables to read from or write into.

Proposed scope, in `src/database/schema`, one migration:

- `institutions`, `org_units`
- `external_identities` (user ↔ provider subject), `role_assignments` (role + scope type/id)
- `academic_terms`, `programs`, `courses`, `course_offerings`, `teaching_assignments`,
  `enrollments`, `groups`, `group_memberships`
- `rooms`, `timetable_events`, `exam_terms`, `exam_registrations`
- `learning_spaces`, `learning_activities`, `assessments`, `assessment_results`,
  `activity_completions`, `submission_refs`
- `official_course_results`

Two rules the model exists to enforce:

- **External IDs are never primary keys.** Platform UUID plus provenance columns
  (`source_system`, `external_id`, `source_version`, `source_updated_at`,
  `last_synchronized_at`), unique per `(institution_id, source_system, external_id)`.
- **Every canonical row carries `institution_id`**, even though deployment is
  single-institution for now. `users` is deliberately left untouched — a user is tied to an
  institution through `external_identities`, which avoids a nullable tenant key.

Write an ADR for the model. Ownership rules (SIS wins vs Moodle wins per entity) are already
tabulated in `docs/Tasks Plan.md` — follow them rather than re-deriving.

## Caveats

- `docs/Tasks Plan.md` and `docs/System Plan.md` are research output, not gospel. Steps 24–27
  read as done but are not: the infrastructure landed, the domain did not. Prefer the codebase
  and current best practice where they conflict, and fix the doc when they do.
- Both docs contain broken citation markers (`cite…turn20view0`) — invisible private-use
  Unicode from a research export. They break exact-string edits; anchor edits on clean text.
- Steps 1–22 are design tasks whose status was inferred from the docs, not verified.
