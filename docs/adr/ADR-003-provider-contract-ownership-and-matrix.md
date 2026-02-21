# ADR-003: Provider Contract Ownership and Integration Matrix

Date: 2026-02-21  
Status: Accepted

## Context

Provider integration touched multiple layers during BYOK rollout:

- web client endpoint usage
- brain controller transport contracts
- run-engine provider runtime behavior
- shared DTO and schema boundaries

Without explicit ownership, provider behavior drifts between API surface, runtime policy, and docs.

## Decision

Define explicit ownership boundaries and a canonical integration matrix:

1. `packages/shared-types` owns provider transport contracts and schemas.
2. `apps/brain` owns public BYOK API routes and request/response validation.
3. `packages/execution-engine` owns runtime adapter behavior and capability enforcement.
4. `apps/brain/src/services/ai/PROVIDER_INTEGRATION_MATRIX.md` is the operational matrix for provider capability and test ownership.
5. `apps/brain/src/services/ai/provider-integration-matrix.fixture.json` is the machine-readable fixture used for documentation consistency and test mapping.

## Consequences

Positive:

- clear contract authority
- reduced provider behavior drift
- easier onboarding for contributors
- explicit test ownership per provider flow

Negative:

- docs and fixture must be maintained when provider capabilities change
- PRs touching provider behavior must update docs and fixtures together

## Rollback Strategy

Rollback is by atomic commit reverts only. If provider integration docs become stale, revert the last matrix change and restore prior validated mapping.
