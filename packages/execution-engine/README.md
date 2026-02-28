# @shadowbox/execution-engine

Execution runtime package for Shadowbox.

## What It Contains

Two layers are exported:

- Core engine package APIs (`types`, `core`, `tools`, `events`, `observability`, `artifacts`, `pricing`, `cost`).
- Extracted Brain runtime surface under `runtime`:
  - `engine`
  - `run`
  - `task`
  - `state`
  - `orchestration`
  - `planner`
  - `agents`
  - `llm`
  - `cost`

## Import Surface

```ts
import * as ExecutionEngine from "@shadowbox/execution-engine";
import { RunEngine, RunRepository, TaskRepository } from "@shadowbox/execution-engine/runtime";
```

Brain compatibility wrappers now re-export from `@shadowbox/execution-engine/runtime`.

## Development Commands

```bash
pnpm --filter @shadowbox/execution-engine type-check
pnpm --filter @shadowbox/execution-engine test
pnpm --filter @shadowbox/execution-engine build
```

## Extraction Notes (Phase 3.2)

- Runtime modules were moved from `apps/brain/src/core/*` into `packages/execution-engine/src/runtime/*`.
- Migration is extraction-first (move/import rewiring), not rewrite-first.
- Package runtime exports are the intended stable boundary for Phase 4.

## Provider Adapter Boundary

Provider-specific behavior must stay in `src/adapters/*`. Runtime modules under
`src/runtime/*` may only consume provider-neutral contracts.

### Adapter Onboarding (Repeatable Path)

1. Implement a new adapter in `src/adapters/<ProviderName>Adapter.ts` that
   satisfies `ModelProvider`.
2. Register it via `ProviderAdapterRegistry` (from `src/adapters`) using a
   stable lowercase provider id (for example `openai`, `anthropic`, `groq`).
3. Expose adapter metadata through provider-neutral interfaces only
   (`ModelProvider`, registry descriptors), not provider SDK types.
4. Add or update unit/integration tests for the adapter behavior.
5. Run the boundary guard test to verify runtime isolation:
   `pnpm --filter @shadowbox/execution-engine test -- tests/unit/runtime-adapter-boundary.test.ts`
