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
