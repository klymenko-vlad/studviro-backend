# AGENTS.md

Instructions for AI agents working in this repository.

## Test-driven development

Use test-driven development when adding or changing behavior:

1. Write tests that describe the expected behavior before implementing it.
2. Cover representative positive, negative, boundary and failure cases.
3. Run the tests and confirm that the new or changed tests fail for the expected
   reason.
4. Implement the smallest complete change that makes the tests pass.
5. Refactor while keeping the full test suite green.

Test observable behavior rather than implementation details. Keep tests focused,
readable and independent. For bug fixes, add a regression test that reproduces
the bug before fixing it.

## Status handoff

`docs/STATUS.md` is the entry point. Read it first — it says what exists, what does not, and
what the next task is.

Update it as part of any change that alters that picture: finishing a backlog step, adding a
module or table, or invalidating something it claims. Rewrite the affected lines; do not
append a changelog. It must stay under ~100 lines, so trimming stale detail is part of the
edit. Leave it alone for changes it does not affect.

## Size and decomposition

Keep every unit small and single-purpose — files, modules, services, components, hooks,
functions. This holds on both sides of the product: a NestJS service and a React component
are subject to the same rule.

- One exported concern per file. A service that handles two subjects is two services; a
  component rendering two independent regions is two components.
- Extract as soon as a file grows past roughly 150–200 lines, a function past one screen,
  or a component past one clear responsibility. Prefer several small collaborators over one
  file that "has everything in one place".
- Split by responsibility, not by line count: the extracted piece must be nameable in a few
  words without "and" in the name.
- A long file that only aggregates small pieces (a schema barrel, a route table) is fine.
  A long file that reasons is not.

## Backlog work

When the work comes from the backlog, read `docs/Task Tracker.md` first: it carries the
current status of every step and the working agreement that governs how those steps are
delivered and committed.

## Comments

Write no comments. Treat this as the rule, not a preference.

Code explains itself through naming, decomposition and types. If something seems
to need a comment, fix the code instead — rename the variable, extract the
function, tighten the type.

Specifically, do not write:

- comments restating what the next line does;
- doc blocks on types, columns, tables, constants or self-evident functions;
- rationale prose ("we do X because Y") — that belongs in `docs/adr/` or the
  commit message, not the source;
- section banners, `TODO`s, or commented-out code.

The rare exception is a single line warning of something genuinely
counter-intuitive that a reader would otherwise break — a protocol quirk, a
deliberate deviation from an obvious implementation. If you are writing more than
one such comment in a file, you are still writing too many.

This applies to code you add and to code you edit: do not carry existing comments
forward by default.
