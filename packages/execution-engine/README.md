# @shadowbox/execution-engine

**Deterministic execution engine for orchestrating agent tasks**

Part of Phase 2.1: Orchestration & Execution Layer

## Overview

The execution engine is the core runtime that:

1. **Consumes structured plans** from the Phase 2 planner
2. **Executes steps sequentially** with full state management
3. **Safely invokes tools** through controlled abstraction layers
4. **Maintains execution context** and accumulates memory across steps
5. **Enforces hard limits** (budget, iterations, time)
6. **Produces deterministic artifacts** for audit and replay

## Architecture

```
Plan (from Phase 2)
    ↓
PlanExecutionEngine (main loop)
    ↓
ExecutionContextManager (state & memory)
    ↓
ExecutionStateTracker (snapshots & replay)
```

## Key Features

### Deterministic Execution
- Same plan + same context → always identical state transitions
- No random branching or time-dependent logic
- Full replay capability for debugging and auditing

### Controlled State Management
- **ExecutionContext**: Passed between steps, accumulates outputs and memory
- **ExecutionState**: Tracks overall progress, token usage, stop reasons
- **MemoryBlocks**: Blackboard-style state accumulation

### Hard Limits
- Budget exhaustion detection (token limits)
- Max iteration enforcement
- Execution timeout enforcement

### Artifact Preservation
- Full execution traces
- Step-by-step outputs
- Structured logs
- Determinism verification

## Package Structure

```
src/
├── types/                    # Type definitions
│   ├── plan.ts              # Plan, Step, ToolCall (Zod schemas)
│   ├── execution.ts         # ExecutionState, ExecutionContext, MemoryBlock
│   ├── results.ts           # StepResult, ToolResult, LogEntry
│   ├── artifacts.ts         # Artifact types, ArtifactStore interface
│   ├── errors.ts            # Custom error classes
│   └── index.ts             # Barrel export
├── core/                     # Core orchestration components
│   ├── PlanExecutionEngine.ts       # Main execution loop
│   ├── ExecutionContextManager.ts   # Context & memory management
│   ├── ExecutionStateTracker.ts     # State snapshots & replay
│   └── index.ts             # Barrel export
└── index.ts                 # Public API

tests/
├── unit/                     # Unit tests (co-located pattern)
│   ├── types.test.ts
│   ├── PlanExecutionEngine.test.ts
│   ├── ExecutionContextManager.test.ts
│   └── ExecutionStateTracker.test.ts
└── integration/             # Integration tests (coming in PR 2)
    ├── end-to-end.test.ts
    └── replay.test.ts
```

## Type Safety

- **Zero `any` types**: All types explicitly defined with Zod schemas
- **Strict validation**: Runtime validation using Zod for all inputs
- **Branded types**: Execution concepts modeled as distinct types
- **Discriminated unions**: Status, error types use unions for exhaustiveness

## Usage

### Basic Setup

```typescript
import { PlanExecutionEngine, initializeExecutionState } from '@shadowbox/execution-engine'
import type { Plan } from '@shadowbox/execution-engine'

const engine = new PlanExecutionEngine({
  maxIterations: 20,
  maxTokens: 100000,
  maxExecutionTimeMs: 5 * 60 * 1000
})

const plan: Plan = {
  id: 'plan-1',
  goal: 'implement feature',
  description: 'add auth',
  steps: [
    {
      id: 'step-1',
      type: 'analysis',
      title: 'Analyze',
      description: 'analyze codebase',
      input: { prompt: 'what needs auth?' }
    }
  ]
}

const state = await engine.execute(plan, '/path/to/repo', 'run-1')
console.log(state.status) // 'completed', 'failed', or 'stopped'
```

### With Artifact Store

```typescript
import { PlanExecutionEngine } from '@shadowbox/execution-engine'
import type { ArtifactStore } from '@shadowbox/execution-engine'

const store: ArtifactStore = {
  // Implement persistence
}

const engine = new PlanExecutionEngine({
  artifactStore: store
})
```

### Context Management

```typescript
import { ExecutionContextManager } from '@shadowbox/execution-engine'

const manager = new ExecutionContextManager(
  plan,
  '/repo',
  'run-1',
  'task-1',
  { NODE_ENV: 'production' }
)

// Add shared memory across steps
manager.addMemory('step-1', 'analysis_result', findings)

// Get context for next step
const context = manager.getContextForStep(plan.steps[1])
```

### Replay & Determinism

```typescript
import { ExecutionStateTracker } from '@shadowbox/execution-engine'

const tracker = new ExecutionStateTracker(store, 'run-1')

// Save snapshots after each step
await tracker.saveSnapshot(state)

// Verify determinism
const isDeterministic = tracker.verifyDeterminism(previousSnapshots)
```

## Error Handling

```typescript
import {
  ExecutionError,
  StepFailureError,
  ToolExecutionError,
  BudgetExhaustedError
} from '@shadowbox/execution-engine'

try {
  await engine.execute(plan, repo, runId)
} catch (error) {
  if (error instanceof BudgetExhaustedError) {
    console.log(`Budget exhausted at step ${error.stepId}`)
  }
}
```

## Test Coverage

### Unit Tests
- Type validation (Zod schemas)
- Engine configuration and execution
- Context management and memory
- State tracking and snapshots
- Error handling

Target: 70%+ coverage

### Integration Tests (PR 2)
- Full execution flow
- Determinism verification
- Tool invocation
- Artifact persistence

## Design Principles

### 1. Single Responsibility
- Engine: orchestration loop only
- ContextManager: state accumulation only
- StateTracker: persistence and replay only

### 2. Determinism First
- No random branching
- No time-dependent logic (except timestamps)
- Full trace for debugging

### 3. Safety Over Convenience
- Hard limits enforced
- No silent failures
- Comprehensive error types

### 4. Future-Ready Abstraction
- Tool executors replaceable (Phase 2.2)
- Model providers pluggable (Phase 2.3)
- Artifact stores swappable (Phase 3)

## Next Steps

### PR 1 (Current)
- ✅ Core types
- ✅ Engine skeleton
- ✅ Context & state management
- ✅ Unit tests

### PR 2
- Model provider abstraction
- Tool executor interface
- Output validation
- OpenAI adapter

### PR 3
- Tool implementations
- ToolValidator
- Tool registry

### PR 4
- EventBus
- ExecutionLogger
- E2E tests
- Performance baseline

## Development

```bash
# Install dependencies
npm install

# Type check
npm run type-check

# Run tests
npm test

# Run with coverage
npm run test:coverage

# Build
npm run build
```

## API Reference

See `src/types/index.ts` and `src/core/index.ts` for full type definitions and interfaces.

## Contributing

Follow AGENTS.md:
- No `any` types
- Co-located tests
- Conventional commits
- Atomic PRs

---

**Status**: Phase 2.1 (PR 1) — Types & Core Components
