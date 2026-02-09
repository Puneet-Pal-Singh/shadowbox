# Phase 1 Task 0 — Context Assembly Interfaces

## Low-Level Implementation Plan (Types Only)

**Status**: Ready for Implementation  
**Scope**: Interfaces and type definitions ONLY  
**Estimated Effort**: 1 day  
**Hard Constraint**: ZERO runtime logic, implementations, or algorithms

---

## 🎯 Scope Definition

**Task 0 = "TCP spec, not the browser"**

This task creates the **vendor-neutral contracts** that all implementations will follow. Think of it as writing the interface definitions before building the classes.

### ✅ What TO Include

- TypeScript interface definitions
- Type aliases
- Enums
- Documentation comments (JSDoc)
- Package structure
- Type exports

### ❌ What NOT To Include

- Class implementations
- Functions with logic
- Algorithms
- Token counting heuristics
- Formatting utilities
- Test implementations
- Default values or runtime logic

---

## 📁 Target Directory Structure

```
packages/context-assembly/
├── package.json              # Package metadata only
├── tsconfig.json             # TypeScript config
├── README.md                 # Interface documentation
├── src/
│   ├── index.ts              # Type exports only
│   └── types/
│       ├── index.ts          # Public type barrel
│       ├── input.ts          # Input interfaces
│       ├── output.ts         # Output interfaces
│       ├── context.ts        # Core context types
│       ├── repo.ts           # Repository types
│       ├── memory.ts         # Memory types
│       ├── runtime.ts        # Runtime event types
│       ├── tools.ts          # Tool descriptor types
│       ├── constraints.ts    # Constraint/budget types
│       └── builder.ts        # Builder interface only
└── .gitignore
```

**Total Files**: 12 files  
**All files**: Type definitions only (no implementations)

---

## 📝 Implementation Steps

### Step 1: Package Setup (30 minutes)

**File**: `packages/context-assembly/package.json`

```json
{
  "name": "@shadowbox/context-assembly",
  "version": "0.1.0",
  "description": "Context Assembly Engine - Type definitions",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.3.0"
  }
}
```

**File**: `packages/context-assembly/tsconfig.json`

```json
{
  "extends": "../../packages/typescript-config/base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "exactOptionalPropertyTypes": true
  },
  "include": ["src/**/*"]
}
```

**File**: `packages/context-assembly/.gitignore`

```
dist/
node_modules/
*.log
```

### Step 2: Core Context Types (30 minutes)

**File**: `src/types/context.ts`

```typescript
/**
 * Core context assembly types
 * Pure interfaces - no implementations
 */

/**
 * Unique identifier for a context assembly operation
 */
export type RunId = string;

/**
 * Agent role classification
 */
export type AgentRole =
  | "planner"
  | "coder"
  | "reviewer"
  | "executor"
  | "generic";

/**
 * Agent capability flags
 */
export type AgentCapability =
  | "read_files"
  | "write_files"
  | "git"
  | "run_tests"
  | "search"
  | "execute_code";

/**
 * Assembly strategy selection
 */
export type AssemblyStrategy = "greedy" | "balanced" | "conservative";

/**
 * Message role in context
 */
export type MessageRole = "system" | "user" | "assistant" | "tool";

/**
 * Runtime event types
 */
export type RuntimeEventType =
  | "tool_call"
  | "tool_error"
  | "tool_result"
  | "execution_result"
  | "user_interruption"
  | "agent_switch"
  | "checkpoint";

/**
 * Symbol kinds for code indexing
 */
export type SymbolKind =
  | "function"
  | "class"
  | "type"
  | "interface"
  | "variable"
  | "constant";

/**
 * Memory chunk types
 */
export type MemoryType = "fact" | "decision" | "context" | "feedback";

/**
 * Tool categories
 */
export type ToolCategory =
  | "filesystem"
  | "git"
  | "execution"
  | "search"
  | "utility";

/**
 * Git change types
 */
export type ChangeType = "added" | "modified" | "deleted" | "renamed";
```

### Step 3: Input Types (30 minutes)

**File**: `src/types/input.ts`

```typescript
import type {
  RunId,
  AgentRole,
  AgentCapability,
  AssemblyStrategy,
} from "./context.js";
import type { RepoSnapshot } from "./repo.js";
import type { MemorySnapshot } from "./memory.js";
import type { RuntimeEvent } from "./runtime.js";

/**
 * Primary input to context assembly
 */
export interface ContextBuildInput {
  /** Unique identifier for this assembly operation */
  runId: RunId;

  /** User's goal/intent */
  goal: UserGoal;

  /** Agent receiving this context */
  agent: AgentDescriptor;

  /** Optional repository snapshot */
  repo?: RepoSnapshot;

  /** Optional memory snapshot */
  memory?: MemorySnapshot;

  /** Recent runtime events */
  recentEvents?: RuntimeEvent[];

  /** Assembly constraints */
  constraints: ContextConstraints;
}

/**
 * User goal representation
 */
export interface UserGoal {
  /** Raw user input */
  raw: string;

  /** Optional normalized/rewritten version */
  normalized?: string;

  /** Optional intent classification */
  intentType?: "coding" | "debugging" | "refactoring" | "explaining" | "other";
}

/**
 * Agent description
 */
export interface AgentDescriptor {
  /** Unique agent identifier */
  id: string;

  /** Agent's primary role */
  role: AgentRole;

  /** Agent capabilities */
  capabilities: AgentCapability[];

  /** Optional specializations */
  specializations?: string[];
}

/**
 * Assembly constraints and budgets
 */
export interface ContextConstraints {
  /** Maximum tokens allowed */
  maxTokens: number;

  /** Assembly strategy to use */
  strategy: AssemblyStrategy;

  /** Whether summarization is allowed */
  allowSummarization: boolean;

  /** Optional: Buffer percentage to reserve */
  bufferPercentage?: number;

  /** Optional: Max files to include */
  maxFiles?: number;

  /** Optional: Max event age in ms */
  maxEventAge?: number;
}

/**
 * Budget allocation configuration
 */
export interface BudgetAllocation {
  /** System prompt percentage */
  system: number;

  /** Messages percentage */
  messages: number;

  /** Tools percentage */
  tools: number;
}
```

### Step 4: Repository Types (20 minutes)

**File**: `src/types/repo.ts`

```typescript
import type { SymbolKind, ChangeType } from "./context.js";

/**
 * Repository snapshot
 * Immutable representation of repo state
 */
export interface RepoSnapshot {
  /** Absolute path to repo root */
  root: string;

  /** File descriptors */
  files: FileDescriptor[];

  /** Optional symbol index */
  symbols?: SymbolIndex[];

  /** Optional git diffs */
  diffs?: GitDiff[];

  /** Repository metadata */
  metadata?: RepoMetadata;
}

/**
 * File descriptor (no content required)
 */
export interface FileDescriptor {
  /** Relative path from repo root */
  path: string;

  /** File size in bytes */
  size: number;

  /** Programming language */
  language?: string;

  /** Last modified timestamp (ms) */
  lastModified?: number;

  /** Optional: File content */
  content?: string;

  /** Optional: Relevance score 0-1 */
  relevanceScore?: number;
}

/**
 * Code symbol index entry
 */
export interface SymbolIndex {
  /** Symbol name */
  name: string;

  /** Symbol kind */
  kind: SymbolKind;

  /** Containing file */
  file: string;

  /** Line range [start, end] */
  range: [number, number];

  /** Optional documentation */
  documentation?: string;
}

/**
 * Git diff entry
 */
export interface GitDiff {
  /** File path */
  file: string;

  /** Patch content */
  patch: string;

  /** Change type */
  changeType?: ChangeType;

  /** Lines added */
  additions?: number;

  /** Lines deleted */
  deletions?: number;
}

/**
 * Repository metadata
 */
export interface RepoMetadata {
  /** Current branch */
  branch?: string;

  /** Current commit hash */
  commit?: string;

  /** Uncommitted changes flag */
  dirty?: boolean;

  /** Remote URL */
  remoteUrl?: string;
}
```

### Step 5: Memory Types (15 minutes)

**File**: `src/types/memory.ts`

```typescript
import type { MemoryType } from "./context.js";

/**
 * Memory snapshot
 * Durable memory representation
 */
export interface MemorySnapshot {
  /** Summarized long-term memories */
  summaries?: MemoryChunk[];

  /** Pinned high-priority memories */
  pinned?: MemoryChunk[];

  /** Recent short-term memories */
  recent?: MemoryChunk[];
}

/**
 * Individual memory chunk
 */
export interface MemoryChunk {
  /** Unique identifier */
  id: string;

  /** Memory content */
  content: string;

  /** Importance score 0-1 */
  importance: number;

  /** Creation timestamp (ms) */
  timestamp?: number;

  /** Source of memory */
  source?: string;

  /** Memory type */
  type?: MemoryType;

  /** Related entities */
  relatedTo?: string[];
}
```

### Step 6: Runtime Event Types (15 minutes)

**File**: `src/types/runtime.ts`

```typescript
import type { RuntimeEventType } from "./context.js";

/**
 * Runtime event for context
 */
export interface RuntimeEvent {
  /** Event type */
  type: RuntimeEventType;

  /** Event payload */
  payload: unknown;

  /** Event timestamp (ms) */
  timestamp: number;

  /** Optional correlation ID */
  eventId?: string;
}

/**
 * Tool call event payload
 */
export interface ToolCallPayload {
  toolName: string;
  toolCallId: string;
  args: Record<string, unknown>;
}

/**
 * Tool error event payload
 */
export interface ToolErrorPayload {
  toolName: string;
  toolCallId: string;
  error: string;
  retryable: boolean;
}

/**
 * Tool result event payload
 */
export interface ToolResultPayload {
  toolName: string;
  toolCallId: string;
  result: unknown;
  durationMs: number;
}

/**
 * Execution result event payload
 */
export interface ExecutionResultPayload {
  success: boolean;
  output?: string;
  error?: string;
  exitCode?: number;
}
```

### Step 7: Tool Types (15 minutes)

**File**: `src/types/tools.ts`

```typescript
import type { ToolCategory } from "./context.js";

/**
 * Tool descriptor
 */
export interface ToolDescriptor {
  /** Tool name */
  name: string;

  /** Human-readable description */
  description: string;

  /** JSON Schema for parameters */
  schema: unknown;

  /** Required capabilities */
  requiredCapabilities?: string[];

  /** Tool category */
  category?: ToolCategory;

  /** Read-only flag */
  readOnly?: boolean;
}

/**
 * Tool registry type
 */
export type ToolRegistry = Map<string, ToolDescriptor>;
```

### Step 8: Output Types (20 minutes)

**File**: `src/types/output.ts`

```typescript
import type { MessageRole, AssemblyStrategy } from "./context.js";

/**
 * Context bundle output
 * This is what the LLM receives
 */
export interface ContextBundle {
  /** System prompt/instructions */
  system: string;

  /** Context messages */
  messages: ContextMessage[];

  /** Available tools */
  tools: ToolDescriptor[];

  /** Estimated token count */
  tokenEstimate: number;

  /** Optional debug info */
  debug?: ContextDebugInfo;
}

/**
 * Context message
 */
export interface ContextMessage {
  /** Message role */
  role: MessageRole;

  /** Message content */
  content: string;

  /** Tool call ID (for tool messages) */
  toolCallId?: string;

  /** Tool name (for tool messages) */
  toolName?: string;

  /** Message metadata */
  metadata?: MessageMetadata;
}

/**
 * Message metadata
 */
export interface MessageMetadata {
  /** Source identifier */
  source?: string;

  /** Priority score */
  priority?: number;

  /** Original content size */
  originalSize?: number;
}

/**
 * Debug information
 */
export interface ContextDebugInfo {
  /** Files included in context */
  includedFiles: string[];

  /** Files excluded */
  excludedFiles: string[];

  /** Messages dropped */
  droppedMessages: number;

  /** Summarizations applied */
  summarizationsApplied: number;

  /** Token usage breakdown */
  tokenBreakdown: TokenBreakdown;

  /** Strategy used */
  strategyUsed: AssemblyStrategy;

  /** Assembly timestamp */
  assembledAt: number;
}

/**
 * Token usage breakdown
 */
export interface TokenBreakdown {
  /** System tokens */
  system: number;

  /** Message tokens */
  messages: number;

  /** Tool definition tokens */
  tools: number;

  /** Formatting overhead */
  overhead: number;

  /** Total used */
  total: number;

  /** Remaining budget */
  remaining: number;
}
```

### Step 9: Builder Interface (20 minutes)

**File**: `src/types/builder.ts`

```typescript
import type { ContextBuildInput } from "./input.js";
import type { ContextBundle } from "./output.js";

/**
 * ContextBuilder interface
 *
 * Single responsibility: Convert raw world state → LLM-ready context
 *
 * Invariants:
 * - No side effects
 * - No network calls
 * - No filesystem access
 * - No memory mutations
 * - Deterministic output per input
 */
export interface ContextBuilder {
  /**
   * Build context bundle from input
   *
   * @param input - Context build input
   * @returns Promise resolving to context bundle
   */
  build(input: ContextBuildInput): Promise<ContextBundle>;
}

/**
 * Context source interface
 * Extracts context messages from a specific source
 */
export interface ContextSource {
  /** Source name */
  name: string;

  /**
   * Extract context messages
   *
   * @param input - Build input
   * @param maxTokens - Maximum tokens this source can use
   * @returns Promise resolving to source result
   */
  extract(input: ContextBuildInput, maxTokens: number): Promise<SourceResult>;
}

/**
 * Source extraction result
 */
export interface SourceResult {
  /** Extracted messages */
  messages: import("./output.js").ContextMessage[];

  /** Tokens used */
  tokensUsed: number;

  /** Items included */
  itemsIncluded: number;

  /** Items excluded */
  itemsExcluded: number;

  /** Items summarized */
  itemsSummarized: number;
}

/**
 * Assembly strategy interface
 */
export interface AssemblyStrategy {
  /** Strategy name */
  name: string;

  /**
   * Assemble context using this strategy
   *
   * @param input - Build input
   * @param budget - Token budget tracker
   * @param sources - Available context sources
   * @returns Promise resolving to assembly result
   */
  assemble(
    input: ContextBuildInput,
    budget: TokenBudget,
    sources: Map<string, ContextSource>,
  ): Promise<AssemblyResult>;
}

/**
 * Assembly result
 */
export interface AssemblyResult {
  /** Assembled messages */
  messages: import("./output.js").ContextMessage[];

  /** Source results map */
  sourceResults: Map<string, SourceResult>;
}

/**
 * Token budget interface
 */
export interface TokenBudget {
  /** Total budget */
  total: number;

  /** Currently used */
  used: number;

  /** Remaining budget */
  remaining: number;

  /**
   * Attempt to allocate tokens
   * @param amount - Amount to allocate
   * @returns Whether allocation succeeded
   */
  allocate(amount: number): boolean;

  /**
   * Force allocation (exceeds budget if needed)
   * @param amount - Amount to allocate
   */
  forceAllocate(amount: number): void;

  /**
   * Get usage statistics
   */
  getUsage(): TokenUsage;
}

/**
 * Token usage statistics
 */
export interface TokenUsage {
  used: number;
  total: number;
  percentage: number;
}

/**
 * Tool filter interface
 */
export interface ToolFilter {
  /**
   * Filter available tools
   *
   * @param tools - All available tools
   * @param agent - Agent descriptor
   * @returns Filtered tools
   */
  filter(
    tools: import("./tools.js").ToolDescriptor[],
    agent: import("./input.js").AgentDescriptor,
  ): import("./tools.js").ToolDescriptor[];
}
```

### Step 10: Type Barrel Export (10 minutes)

**File**: `src/types/index.ts`

```typescript
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
  ToolCallPayload,
  ToolErrorPayload,
  ToolResultPayload,
  ExecutionResultPayload,
} from "./runtime.js";

// Tool types
export type { ToolDescriptor, ToolRegistry } from "./tools.js";

// Builder interfaces
export type {
  ContextBuilder,
  ContextSource,
  SourceResult,
  AssemblyStrategy,
  AssemblyResult,
  TokenBudget,
  TokenUsage,
  ToolFilter,
} from "./builder.js";
```

### Step 11: Public API Export (5 minutes)

**File**: `src/index.ts`

````typescript
/**
 * Context Assembly Engine
 *
 * Vendor-neutral interfaces for converting world state → LLM context.
 *
 * @example
 * ```typescript
 * import type {
 *   ContextBuilder,
 *   ContextBuildInput,
 *   ContextBundle
 * } from '@shadowbox/context-assembly'
 *
 * // Implement the interface
 * class MyContextBuilder implements ContextBuilder {
 *   async build(input: ContextBuildInput): Promise<ContextBundle> {
 *     // Implementation
 *   }
 * }
 * ```
 */

// Re-export all types
export * from "./types/index.js";
````

### Step 12: Documentation (30 minutes)

**File**: `README.md`

````markdown
# @shadowbox/context-assembly

Vendor-neutral interfaces for context assembly in multi-agent systems.

## Overview

This package defines the contracts and type definitions for assembling LLM context from:

- Repository snapshots
- Memory stores
- Runtime events
- User goals

## Philosophy

**Task 0 = Interfaces Only**

This package contains:

- ✅ TypeScript interfaces
- ✅ Type definitions
- ✅ Contracts
- ✅ Documentation

This package does NOT contain:

- ❌ Implementations
- ❌ Runtime logic
- ❌ Algorithms
- ❌ Utilities

## Core Invariants

All implementations MUST respect:

1. **No Side Effects** - Context assembly must be pure
2. **No Network Calls** - No external dependencies during assembly
3. **No Filesystem Access** - All data via snapshots
4. **No Memory Mutation** - Immutable operations only
5. **Deterministic** - Same input always produces same output

## Key Interfaces

### ContextBuilder

```typescript
interface ContextBuilder {
  build(input: ContextBuildInput): Promise<ContextBundle>;
}
```
````

Single responsibility: Convert raw world state → LLM-ready context.

### ContextBuildInput

```typescript
interface ContextBuildInput {
  runId: string;
  goal: UserGoal;
  agent: AgentDescriptor;
  repo?: RepoSnapshot;
  memory?: MemorySnapshot;
  recentEvents?: RuntimeEvent[];
  constraints: ContextConstraints;
}
```

### ContextBundle

```typescript
interface ContextBundle {
  system: string;
  messages: ContextMessage[];
  tools: ToolDescriptor[];
  tokenEstimate: number;
  debug?: ContextDebugInfo;
}
```

## Usage

```typescript
import type {
  ContextBuilder,
  ContextBuildInput,
  ContextBundle,
} from "@shadowbox/context-assembly";

// Your implementation
class MyContextBuilder implements ContextBuilder {
  async build(input: ContextBuildInput): Promise<ContextBundle> {
    // Implementation here
  }
}
```

## Directory Structure

```
src/
├── index.ts          # Public API
└── types/
    ├── index.ts      # Type exports
    ├── context.ts    # Core types
    ├── input.ts      # Input interfaces
    ├── output.ts     # Output interfaces
    ├── repo.ts       # Repository types
    ├── memory.ts     # Memory types
    ├── runtime.ts    # Event types
    ├── tools.ts      # Tool types
    ├── constraints.ts # Budget types
    └── builder.ts    # Builder interfaces
```

## Next Steps

After these interfaces are frozen:

- **Task 1**: ContextBuilder implementation
- **Task 2**: Token budgeting strategies
- **Task 3**: Source adapters
- **Task 4**: Advanced strategies

## License

MIT

```

---

## ✅ Completion Checklist

### Files Created
- [ ] `package.json` - Package metadata
- [ ] `tsconfig.json` - TypeScript config
- [ ] `.gitignore` - Git ignore rules
- [ ] `README.md` - Interface documentation
- [ ] `src/index.ts` - Public API exports
- [ ] `src/types/index.ts` - Type barrel
- [ ] `src/types/context.ts` - Core type definitions (12 types)
- [ ] `src/types/input.ts` - Input interfaces (5 interfaces)
- [ ] `src/types/output.ts` - Output interfaces (5 interfaces)
- [ ] `src/types/repo.ts` - Repository types (5 interfaces)
- [ ] `src/types/memory.ts` - Memory types (2 interfaces)
- [ ] `src/types/runtime.ts` - Runtime types (5 interfaces)
- [ ] `src/types/tools.ts` - Tool types (2 interfaces)
- [ ] `src/types/builder.ts` - Builder interfaces (7 interfaces)

### Quality Checks
- [ ] TypeScript strict mode passes
- [ ] All types are exported
- [ ] JSDoc comments on all public types
- [ ] No implementations (verify grep for `class`, `function`, logic)
- [ ] No runtime dependencies
- [ ] README explains usage

### Verification
- [ ] `npm run typecheck` passes
- [ ] `npm run build` generates .d.ts files
- [ ] All interfaces from FINAL spec present
- [ ] No logic/implementation code

---

## 🎯 Success Criteria

1. **Types Only**: Zero runtime logic, implementations, or algorithms
2. **Complete Coverage**: All interfaces from FINAL spec implemented
3. **Vendor Neutral**: No platform-specific types
4. **Well Documented**: JSDoc on all public types
5. **Type Safe**: TypeScript strict mode, no `any` types
6. **Build Ready**: Compiles to .d.ts declarations

---

## 🔒 Hard Constraints (Do Not Violate)

1. **NO** class implementations (only interface definitions)
2. **NO** function bodies with logic
3. **NO** algorithms or heuristics
4. **NO** utility functions
5. **NO** default values or runtime constants
6. **NO** test implementations
7. **NO** dependencies beyond TypeScript

**Remember**: "TCP spec, not the browser"

---

*This plan creates the contracts. Implementations come in Task 1+.*
```
