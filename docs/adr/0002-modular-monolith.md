# 2. Modular monolith over microservices

- Status: accepted
- Date: 2026-08-08

## Context

The API is a single NestJS application. The alternative — splitting per domain
from the start — was considered and rejected.

## Decision

One deployable, internally partitioned into modules under `src/modules/*`.
Modules communicate through their public surface, never by reaching into
another module's repository.

Two things keep the option of splitting later open:

- Repositories go through `TransactionHost`, so no module holds a raw
  connection.
- `ROLE=api|worker|all` already separates request handling from queue
  consumption at the process level, which is the split that actually relieves
  load first.

## Consequences

- One migration path, one deploy, one trace — until a module genuinely needs
  its own scaling profile.
- Module boundaries are a convention today. They should be enforced with
  `import-x/no-restricted-paths` before the module count grows.
