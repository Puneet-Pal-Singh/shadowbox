# ADR-002: Extraction to Execution Engine (Move, Not Rewrite)

Date: 2026-02-13
Status: Accepted

## Context

Runtime domain modules were implemented inside `apps/brain/src/core/*`, while `packages/execution-engine` already exists for reusable engine concerns. Rewriting core logic would add high regression risk.

## Decision

Migrate runtime modules by extraction:

- move folders incrementally
- preserve behavior
- update imports and package boundaries
- validate after each move with typecheck/tests

No algorithmic rewrites are allowed during migration commits.

## Consequences

- Positive:
  - reduced split-brain architecture risk
  - reusable runtime package boundary
  - lower regression risk than rebuild
- Negative:
  - temporary dual-location complexity during migration
  - import churn and test adjustments

## Rollback Strategy

Each folder move is committed atomically. On regression, revert only the most recent migration commit and continue from last green state.
