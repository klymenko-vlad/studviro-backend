# 1. Record architecture decisions

- Status: accepted
- Date: 2026-08-08

## Context

`AGENTS.md` asks for code with almost no comments: naming, decomposition and
types should carry the meaning. That works for _what_ the code does, but it
leaves nowhere to record _why_ a particular approach was chosen over the
obvious alternative — and that reasoning is exactly what a future reader needs
before changing it.

Without somewhere to put it, the reasoning either becomes the comments the
guidance rules out, or it is lost and the decision gets quietly reversed.

## Decision

Architecturally significant decisions are recorded here as numbered ADRs. An
ADR is warranted when a choice is expensive to reverse, constrains later work,
or will look wrong to someone who does not know what was rejected.

Routine choices do not need one.

## Consequences

- Reviewers can challenge a decision without re-deriving it.
- Superseded ADRs stay in place, marked superseded, so the history is legible.
