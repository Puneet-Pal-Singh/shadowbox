/**
 * Context Assembly Engine - Type Exports
 *
 * All types are pure interfaces/contracts.
 * No implementations or runtime logic.
 */

// Core types
export type {
  RunId,
  AgentRole,
  AgentCapability,
  AssemblyStrategy,
  MessageRole,
  RuntimeEventType,
  SymbolKind,
  MemoryType,
  ToolCategory,
  ChangeType,
} from "./context.js";

// Input types
export type {
  ContextBuildInput,
  UserGoal,
  AgentDescriptor,
  ContextConstraints,
  BudgetAllocation,
} from "./input.js";

// Output types
export type {
  ContextBundle,
  ContextMessage,
  MessageMetadata,
  ContextDebugInfo,
  TokenBreakdown,
} from "./output.js";

// Repository types
export type {
  RepoSnapshot,
  FileDescriptor,
  SymbolIndex,
  GitDiff,
  RepoMetadata,
} from "./repo.js";

// Memory types
export type { MemorySnapshot, MemoryChunk } from "./memory.js";

// Runtime types
export type {
  RuntimeEvent,
  ToolCallEvent,
  ToolErrorEvent,
  ToolResultEvent,
  ExecutionResultEvent,
  UserInterruptionEvent,
  AgentSwitchEvent,
  CheckpointEvent,
} from "./runtime.js";

// Tool types
export type { ToolDescriptor, ToolRegistry } from "./tools.js";

// Builder interfaces
export type {
  ContextBuilder,
  ContextSource,
  SourceResult,
  AssemblyResult,
  AssemblyStrategyHandler,
  TokenBudget,
  TokenUsage,
  ToolFilter,
} from "./builder.js";
