# Provider Integration Matrix

This document defines provider behavior expectations, ownership, and test coverage mapping for BYOK flows.

## Contract Ownership

- Transport schemas: `packages/shared-types/src/provider.ts`
- Public BYOK API routes: `apps/brain/src/controllers/ProviderController.ts`
- Runtime provider behavior: `apps/brain/src/runtime/RunEngineRuntime.ts`
- Runtime selection policy: `apps/brain/src/services/ai/ModelSelectionPolicy.ts`

## Endpoint Contract Surface

- `GET /api/byok/providers/catalog`
- `GET /api/byok/providers/connections`
- `POST /api/byok/providers/connect`
- `POST /api/byok/providers/validate`
- `POST /api/byok/providers/disconnect`
- `PATCH /api/byok/preferences`

## Provider Capability Matrix

| Provider | Connection | Catalog | Validate | Disconnect | Strict Model Guard |
| --- | --- | --- | --- | --- | --- |
| openrouter | Supported | Supported | Supported | Supported | Enforced |
| openai | Supported | Supported | Supported | Supported | Enforced |
| groq | Supported | Supported | Supported | Supported | Enforced |

## Test Ownership Matrix

| Flow | Primary Test File |
| --- | --- |
| BYOK controller API surface | `apps/brain/src/controllers/ProviderController.test.ts` |
| Provider state contract integration | `apps/brain/src/integration/provider-state.contract.test.ts` |
| Strict provider/model mismatch policy | `apps/brain/src/services/ai/ModelSelectionPolicy.strict-mode.test.ts` |
| Durable credential persistence semantics | `apps/brain/src/services/providers/DurableProviderStore.test.ts` |

## Update Rule

When adding provider capabilities, updating schemas, or changing ownership boundaries:

1. update `packages/shared-types` contracts
2. update this matrix
3. update `provider-integration-matrix.fixture.json`
4. update/extend affected tests in the matrix above
