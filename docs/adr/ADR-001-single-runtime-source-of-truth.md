# ADR-001: Single Runtime Source of Truth

Date: 2026-02-13
Status: Accepted

## Context

The system previously allowed dual orchestration paths (legacy stream orchestrator and RunEngine). This created cost-policy bypass risk, rollout inconsistency, and divergent behavior under load.

## Decision

Adopt a single runtime path for chat orchestration:

`ChatController -> RunEngine -> TaskExecutor -> LLMGateway -> ProviderAdapter`

Legacy orchestrator routing is removed from active request handling.

## Consequences

- Positive:
  - deterministic execution path
  - consistent budget and cost enforcement
  - fewer rollout flags and lower operational entropy
- Negative:
  - migration work required for legacy assumptions
  - stricter coupling to RunEngine interfaces until extraction stabilizes

## Rollback Strategy

Rollback is done through atomic commit reverts only (no history rewrite). Re-introducing dual routing is not permitted unless explicitly approved as an incident mitigation.
