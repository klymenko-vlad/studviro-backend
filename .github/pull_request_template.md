## What

<!-- What changes, in one or two sentences. -->

## Why

<!-- The problem this solves. Link the issue if there is one. -->

## How to verify

<!-- Steps a reviewer can actually run. -->

## Checklist

- [ ] Tests cover the new behaviour (unit for logic, e2e for HTTP/DB contracts)
- [ ] Schema changes have a generated migration committed (`pnpm db:generate`)
- [ ] New env vars are added to `src/config/env.schema.ts` and `.env.example`
- [ ] No breaking API change, or the version was bumped
