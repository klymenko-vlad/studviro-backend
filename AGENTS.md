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

## Comments

Do not write comments, in the overwhelming majority of cases. Prefer no comment
over a comment.

Code should explain itself through naming, decomposition and types. If something
seems to need a comment, the first move is to fix the code — rename the
variable, extract the function, tighten the type — not to describe it in prose.
