// apps/brain/src/core/index.ts
// Core module barrel exports (post-refactor subset)

// Core modules still in use by runtime
export * from "./cost";
export * from "./agents";
export * from "./state";

// NOTE: orchestration and orchestrator modules deleted (zero references)
// Legacy modules preserved for gradual migration:
// - ./run (imports: none, safe to delete)
// - ./task (imports: none, safe to delete)
// - ./engine (import: RunEngineRuntime, unused - safe to delete)
// - ./planner (imports: none, safe to delete)
