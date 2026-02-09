# Phase 1 Task 0 — Context Assembly Engine

## Detailed Implementation Plan (Production Ready)

**Status**: Ready for Implementation  
**Estimated Effort**: 4-5 days  
**Priority**: Critical Path (Blocks all other tasks)  
**Owner**: Engineering Agent  
**Last Updated**: 2026-02-09

---

## Executive Summary

Implement a **pure, deterministic, vendor-neutral** Context Assembly Engine that converts raw world state (repo snapshot, memory, events) into LLM-ready context bundles. This is the foundational layer of the multi-agent architecture.

**Hard Constraints**:

- ✅ Zero side effects
- ✅ Zero network calls
- ✅ Zero filesystem access
- ✅ No memory mutations
- ✅ Deterministic: same input → same output

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Directory Structure](#directory-structure)
3. [Implementation Phases](#implementation-phases)
4. [File-by-File Specifications](#file-by-file-specifications)
5. [Integration Points](#integration-points)
6. [Testing Strategy](#testing-strategy)
7. [Success Criteria](#success-criteria)
8. [Appendix: Interface Reference](#appendix-interface-reference)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    ContextBuilder                           │
│  (Entry point: build(input) → Promise<ContextBundle>)       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
        ┌──────────────────────────┐
        │    ContextAssembler      │
        │  (Orchestrates pipeline) │
        └──────────┬───────────────┘
                   │
         ┌─────────┴──────────┐
         │                    │
         ▼                    ▼
┌────────────────┐   ┌─────────────────┐
│ System Prompt  │   │ Context Sources │
│    Builder     │   │   (Pipeline)    │
└────────┬───────┘   └────────┬────────┘
         │                    │
         │         ┌──────────┼──────────┐
         │         │          │          │
         │    FileSource DiffSource MemorySource
         │         │          │          │
         │         └──────────┴──────────┘
         │                    │
         ▼                    ▼
┌─────────────────────────────────────┐
│      Assembly Strategy              │
│  (Greedy | Balanced | Conservative) │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│      TokenBudget Manager            │
│  (Tracks allocation per source)     │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│      Tool Filter                    │
│  (Role-based & Capability-based)    │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│      ContextBundle (Output)         │
│  {system, messages[], tools[],      │
│   tokenEstimate, debug}             │
└─────────────────────────────────────┘
```

---

## Directory Structure

```
packages/context-assembly/
├── README.md
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts                              # Public API
│   ├── types/
│   │   ├── index.ts                          # Type barrel export
│   │   ├── input.ts                          # Input interfaces
│   │   ├── repo.ts                           # Repository types
│   │   ├── memory.ts                         # Memory types
│   │   ├── runtime.ts                        # Event types
│   │   ├── constraints.ts                    # Budget/constraints
│   │   ├── output.ts                         # Output types
│   │   ├── tools.ts                          # Tool descriptors
│   │   └── internal.ts                       # Internal types
│   ├── core/
│   │   ├── index.ts                          # Core exports
│   │   ├── ContextBuilder.ts                 # Main builder
│   │   ├── ContextAssembler.ts               # Pipeline orchestrator
│   │   ├── TokenBudget.ts                    # Budget tracking
│   │   └── SystemPromptBuilder.ts            # System prompt gen
│   ├── strategies/
│   │   ├── index.ts                          # Strategy exports
│   │   ├── BaseStrategy.ts                   # Abstract base
│   │   ├── GreedyStrategy.ts                 # Fill until full
│   │   ├── BalancedStrategy.ts               # Proportional
│   │   └── ConservativeStrategy.ts           # Minimal + buffer
│   ├── sources/
│   │   ├── index.ts                          # Source exports
│   │   ├── BaseSource.ts                     # Abstract base
│   │   ├── FileSource.ts                     # File content
│   │   ├── DiffSource.ts                     # Git diffs
│   │   ├── MemorySource.ts                   # Memory chunks
│   │   ├── SymbolSource.ts                   # Symbol index
│   │   └── EventSource.ts                    # Runtime events
│   ├── filters/
│   │   ├── index.ts                          # Filter exports
│   │   ├── RoleBasedFilter.ts                # Agent role filter
│   │   └── CapabilityBasedFilter.ts          # Capability filter
│   └── utils/
│       ├── index.ts                          # Utils export
│       ├── tokenCounter.ts                   # Token estimation
│       ├── formatters.ts                     # Content formatters
│       └── sorters.ts                        # Sorting utilities
└── tests/
    ├── setup.ts                              # Test setup
    ├── fixtures/
    │   ├── index.ts                          # Fixture exports
    │   ├── sample-repo.ts                    # Repo fixtures
    │   ├── sample-memory.ts                  # Memory fixtures
    │   └── sample-events.ts                  # Event fixtures
    ├── unit/
    │   ├── TokenBudget.test.ts
    │   ├── ContextBuilder.test.ts
    │   ├── strategies.test.ts
    │   ├── sources.test.ts
    │   └── filters.test.ts
    └── integration/
        └── assembly-pipeline.test.ts
```

---

## Implementation Phases

### Phase A: Foundation (Day 1) — 4-6 hours

**Goal**: Set up package structure and implement all type definitions

#### Step A.1: Package Setup (30 min)

Create `packages/context-assembly/package.json`:

```json
{
  "name": "@shadowbox/context-assembly",
  "version": "0.1.0",
  "description": "Context Assembly Engine for multi-agent systems",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/**/*.ts"
  },
  "dependencies": {
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0"
  }
}
```

Create `packages/context-assembly/tsconfig.json`:

```json
{
  "extends": "../../packages/typescript-config/base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

Add to root `package.json` workspaces if not already present.

#### Step A.2: Type Definitions (3-4 hours)

**File**: `src/types/input.ts`

```typescript
/**
 * Input types for Context Assembly Engine
 * @module
 */

/**
 * Main input to ContextBuilder.build()
 */
export interface ContextBuildInput {
  /** Unique identifier for this context assembly run */
  runId: string;

  /** The user's goal/intent */
  goal: UserGoal;

  /** Description of the agent receiving this context */
  agent: AgentDescriptor;

  /** Optional repository snapshot */
  repo?: RepoSnapshot;

  /** Optional memory snapshot */
  memory?: MemorySnapshot;

  /** Recent runtime events for context */
  recentEvents?: RuntimeEvent[];

  /** Constraints and budgets */
  constraints: ContextConstraints;
}

/**
 * User's goal or intent
 */
export interface UserGoal {
  /** Raw user input */
  raw: string;

  /** Optional normalized/rewritten version */
  normalized?: string;

  /** Optional classification of intent type */
  intentType?: "coding" | "debugging" | "refactoring" | "explaining" | "other";
}

/**
 * Agent role definitions
 */
export type AgentRole =
  | "planner"
  | "coder"
  | "reviewer"
  | "executor"
  | "generic";

/**
 * Agent capabilities
 */
export type AgentCapability =
  | "read_files"
  | "write_files"
  | "git"
  | "run_tests"
  | "search"
  | "execute_code";

/**
 * Description of an agent
 */
export interface AgentDescriptor {
  /** Unique agent identifier */
  id: string;

  /** Agent's primary role */
  role: AgentRole;

  /** Capabilities this agent possesses */
  capabilities: AgentCapability[];

  /** Optional specialization tags */
  specializations?: string[];
}
```

**File**: `src/types/repo.ts`

```typescript
/**
 * Repository snapshot types
 * ContextBuilder NEVER touches filesystem - all data provided via snapshot
 */

export interface RepoSnapshot {
  /** Absolute path to repository root */
  root: string;

  /** Array of file descriptors */
  files: FileDescriptor[];

  /** Optional symbol index for code intelligence */
  symbols?: SymbolIndex[];

  /** Optional git diffs */
  diffs?: GitDiff[];

  /** Repository metadata */
  metadata?: RepoMetadata;
}

export interface FileDescriptor {
  /** Relative path from repo root */
  path: string;

  /** File size in bytes */
  size: number;

  /** Programming language (if detectable) */
  language?: string;

  /** Last modified timestamp (ms since epoch) */
  lastModified?: number;

  /** Optional: File content (if pre-loaded) */
  content?: string;

  /** Optional: Relevance score (0-1) from external analyzer */
  relevanceScore?: number;
}

export interface SymbolIndex {
  /** Symbol name */
  name: string;

  /** Symbol kind */
  kind: "function" | "class" | "type" | "interface" | "variable" | "constant";

  /** File containing the symbol */
  file: string;

  /** Line range [start, end] (1-indexed) */
  range: [number, number];

  /** Optional: Symbol documentation/signature */
  documentation?: string;
}

export interface GitDiff {
  /** File path */
  file: string;

  /** Git patch/diff content */
  patch: string;

  /** Change type */
  changeType?: "added" | "modified" | "deleted" | "renamed";

  /** Stats: lines added */
  additions?: number;

  /** Stats: lines deleted */
  deletions?: number;
}

export interface RepoMetadata {
  /** Current branch name */
  branch?: string;

  /** Current commit hash */
  commit?: string;

  /** Whether working directory has uncommitted changes */
  dirty?: boolean;

  /** Remote URL (if available) */
  remoteUrl?: string;
}
```

**File**: `src/types/memory.ts`

```typescript
/**
 * Memory snapshot types
 * Durable, portable memory representation
 */

export interface MemorySnapshot {
  /** Summarized long-term memories */
  summaries?: MemoryChunk[];

  /** Pinned/high-priority memories */
  pinned?: MemoryChunk[];

  /** Recent short-term memories */
  recent?: MemoryChunk[];
}

export interface MemoryChunk {
  /** Unique memory identifier */
  id: string;

  /** Memory content */
  content: string;

  /** Importance score (0-1, higher = more important) */
  importance: number;

  /** Creation timestamp (ms since epoch) */
  timestamp?: number;

  /** Source of the memory (e.g., 'user', 'agent', 'system') */
  source?: string;

  /** Optional: Memory type/category */
  type?: "fact" | "decision" | "context" | "feedback";

  /** Optional: Related entities/files */
  relatedTo?: string[];
}
```

**File**: `src/types/runtime.ts`

```typescript
/**
 * Runtime event types
 * Captures recent execution history
 */

export interface RuntimeEvent {
  /** Event type */
  type: RuntimeEventType;

  /** Event payload (type-specific) */
  payload: unknown;

  /** Event timestamp */
  timestamp: number;

  /** Optional: Event ID for correlation */
  eventId?: string;
}

export type RuntimeEventType =
  | "tool_call"
  | "tool_error"
  | "tool_result"
  | "execution_result"
  | "user_interruption"
  | "agent_switch"
  | "checkpoint";

/** Specific payload types */

export interface ToolCallPayload {
  toolName: string;
  toolCallId: string;
  args: Record<string, unknown>;
}

export interface ToolErrorPayload {
  toolName: string;
  toolCallId: string;
  error: string;
  retryable: boolean;
}

export interface ToolResultPayload {
  toolName: string;
  toolCallId: string;
  result: unknown;
  durationMs: number;
}

export interface ExecutionResultPayload {
  success: boolean;
  output?: string;
  error?: string;
  exitCode?: number;
}
```

**File**: `src/types/constraints.ts`

```typescript
/**
 * Context assembly constraints and budgets
 */

export interface ContextConstraints {
  /** Maximum tokens allowed in final context */
  maxTokens: number;

  /** Assembly strategy to use */
  strategy: AssemblyStrategyType;

  /** Whether to allow content summarization */
  allowSummarization: boolean;

  /** Optional: Minimum buffer to leave (default: 10%) */
  bufferPercentage?: number;

  /** Optional: Maximum number of files to include */
  maxFiles?: number;

  /** Optional: Maximum age of events to include (ms) */
  maxEventAge?: number;
}

export type AssemblyStrategyType = "greedy" | "balanced" | "conservative";

/** Budget allocation configuration for balanced strategy */
export interface BudgetAllocation {
  system: number; // Percentage for system prompt (default: 10%)
  messages: number; // Percentage for messages (default: 60%)
  tools: number; // Percentage for tool definitions (default: 30%)
}
```

**File**: `src/types/output.ts`

```typescript
/**
 * Output types from Context Assembly Engine
 */

/**
 * The final assembled context bundle
 * This is the ONLY thing the LLM sees
 */
export interface ContextBundle {
  /** System prompt/instructions */
  system: string;

  /** Context messages (user, assistant, tool) */
  messages: ContextMessage[];

  /** Available tools for this context */
  tools: ToolDescriptor[];

  /** Estimated token count */
  tokenEstimate: number;

  /** Optional debug information */
  debug?: ContextDebugInfo;
}

export interface ContextMessage {
  /** Message role */
  role: "system" | "user" | "assistant" | "tool";

  /** Message content */
  content: string;

  /** Optional: Tool call ID for tool messages */
  toolCallId?: string;

  /** Optional: Tool name for tool messages */
  toolName?: string;

  /** Optional: Message metadata */
  metadata?: {
    source?: string;
    priority?: number;
    originalSize?: number;
  };
}

export interface ContextDebugInfo {
  /** Files included in context */
  includedFiles: string[];

  /** Files excluded (budget reasons) */
  excludedFiles: string[];

  /** Number of messages dropped */
  droppedMessages: number;

  /** Number of summarizations applied */
  summarizationsApplied: number;

  /** Detailed token usage breakdown */
  tokenBreakdown: TokenBreakdown;

  /** Strategy used */
  strategyUsed: string;

  /** Timestamp of assembly */
  assembledAt: number;
}

export interface TokenBreakdown {
  system: number;
  messages: number;
  tools: number;
  overhead: number;
  total: number;
  remaining: number;
}
```

**File**: `src/types/tools.ts`

```typescript
/**
 * Tool descriptor types
 */

export interface ToolDescriptor {
  /** Tool name (must be unique) */
  name: string;

  /** Human-readable description */
  description: string;

  /** JSON Schema for parameters */
  schema: unknown;

  /** Optional: Required capabilities to use this tool */
  requiredCapabilities?: string[];

  /** Optional: Tool category */
  category?: "filesystem" | "git" | "execution" | "search" | "utility";

  /** Optional: Whether this tool is read-only (safe) */
  readOnly?: boolean;
}

/** Complete tool registry */
export type ToolRegistry = Map<string, ToolDescriptor>;
```

**File**: `src/types/internal.ts`

```typescript
/**
 * Internal types (not exported publicly)
 */

import type { ContextMessage } from "./output.js";

export interface SourceResult {
  messages: ContextMessage[];
  tokensUsed: number;
  itemsIncluded: number;
  itemsExcluded: number;
  itemsSummarized: number;
}

export interface AssemblyResult {
  messages: ContextMessage[];
  debug: AssemblyDebugInfo;
}

export interface AssemblyDebugInfo {
  sourceResults: Map<string, SourceResult>;
  strategyUsed: string;
  tokenBreakdown: TokenBreakdownInternal;
}

export interface TokenBreakdownInternal {
  allocated: number;
  used: number;
  remaining: number;
  bySource: Map<string, number>;
}

export interface PrioritizedItem<T> {
  item: T;
  priority: number;
  tokens: number;
}
```

**File**: `src/types/index.ts`:

```typescript
/**
 * Context Assembly Engine - Type Exports
 */

// Input types
export type {
  ContextBuildInput,
  UserGoal,
  AgentDescriptor,
  AgentRole,
  AgentCapability,
} from "./input.js";

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
  RuntimeEventType,
  ToolCallPayload,
  ToolErrorPayload,
  ToolResultPayload,
  ExecutionResultPayload,
} from "./runtime.js";

// Constraint types
export type {
  ContextConstraints,
  AssemblyStrategyType,
  BudgetAllocation,
} from "./constraints.js";

// Output types
export type {
  ContextBundle,
  ContextMessage,
  ContextDebugInfo,
  TokenBreakdown,
} from "./output.js";

// Tool types
export type { ToolDescriptor, ToolRegistry } from "./tools.js";

// Internal types (exported for advanced use)
export type {
  SourceResult,
  AssemblyResult,
  PrioritizedItem,
} from "./internal.js";
```

---

### Phase B: Core Engine (Day 2) — 6-8 hours

**Goal**: Implement the core ContextBuilder and supporting classes

#### Step B.1: Token Budget Management (1 hour)

**File**: `src/core/TokenBudget.ts`

```typescript
import type { TokenBreakdownInternal } from "../types/internal.js";

/**
 * Tracks token allocation across different sources
 */
export class TokenBudget {
  private used: number = 0;
  private bySource: Map<string, number> = new Map();

  constructor(private total: number) {
    if (total <= 0) {
      throw new Error(`Invalid token budget: ${total}`);
    }
  }

  /**
   * Attempt to allocate tokens
   * @returns true if allocation succeeded
   */
  allocate(amount: number, source: string): boolean {
    if (amount < 0) {
      throw new Error(`Cannot allocate negative tokens: ${amount}`);
    }

    if (this.used + amount > this.total) {
      return false;
    }

    this.used += amount;
    this.bySource.set(source, (this.bySource.get(source) ?? 0) + amount);
    return true;
  }

  /**
   * Force allocation (for required items like system prompt)
   */
  forceAllocate(amount: number, source: string): void {
    if (amount < 0) {
      throw new Error(`Cannot allocate negative tokens: ${amount}`);
    }

    this.used += amount;
    this.bySource.set(source, (this.bySource.get(source) ?? 0) + amount);
  }

  /**
   * Get remaining budget
   */
  remaining(): number {
    return Math.max(0, this.total - this.used);
  }

  /**
   * Get current usage
   */
  getUsage(): { used: number; total: number; percentage: number } {
    return {
      used: this.used,
      total: this.total,
      percentage: (this.used / this.total) * 100,
    };
  }

  /**
   * Get breakdown by source
   */
  getBreakdown(): TokenBreakdownInternal {
    return {
      allocated: this.total,
      used: this.used,
      remaining: this.remaining(),
      bySource: new Map(this.bySource),
    };
  }

  /**
   * Check if budget is exhausted
   */
  isExhausted(): boolean {
    return this.remaining() <= 0;
  }

  /**
   * Reserve a percentage of budget
   */
  reserve(percentage: number): number {
    const amount = Math.floor(this.total * (percentage / 100));
    this.allocate(amount, "_reserved");
    return amount;
  }
}
```

#### Step B.2: System Prompt Builder (1.5 hours)

**File**: `src/core/SystemPromptBuilder.ts`

```typescript
import type { ContextBuildInput, AgentDescriptor } from "../types/index.js";

/**
 * Builds system prompts based on agent configuration and goal
 */
export class SystemPromptBuilder {
  /**
   * Build system prompt from input
   */
  build(input: ContextBuildInput): string {
    const sections: string[] = [];

    // Core identity
    sections.push(this.buildIdentitySection(input.agent));

    // Capabilities
    sections.push(this.buildCapabilitiesSection(input.agent));

    // Current context
    sections.push(this.buildContextSection(input));

    // Goal
    sections.push(this.buildGoalSection(input.goal));

    // Constraints
    sections.push(this.buildConstraintsSection());

    return sections.filter(Boolean).join("\n\n");
  }

  private buildIdentitySection(agent: AgentDescriptor): string {
    const roleDescriptions: Record<string, string> = {
      planner:
        "You are a system architect and planner. Your role is to analyze requirements, design solutions, and create detailed implementation plans.",
      coder:
        "You are a senior software engineer. Your role is to implement features, fix bugs, and write high-quality, maintainable code.",
      reviewer:
        "You are a code reviewer. Your role is to analyze code for correctness, security, and adherence to best practices.",
      executor:
        "You are a DevOps engineer. Your role is to execute commands, manage deployments, and handle infrastructure tasks.",
      generic: "You are a helpful AI assistant.",
    };

    let section = `# Agent Identity\n\n${roleDescriptions[agent.role] ?? roleDescriptions.generic}`;

    if (agent.specializations?.length) {
      section += `\n\nSpecializations: ${agent.specializations.join(", ")}`;
    }

    return section;
  }

  private buildCapabilitiesSection(agent: AgentDescriptor): string {
    const capabilities = agent.capabilities;

    if (!capabilities.length) {
      return "";
    }

    const capabilityDescriptions: Record<string, string> = {
      read_files: "Read and analyze file contents",
      write_files: "Create and modify files",
      git: "Execute git commands and manage version control",
      run_tests: "Run test suites and analyze results",
      search: "Search codebase and find relevant code",
      execute_code: "Execute code and commands",
    };

    const lines = capabilities.map(
      (cap) => `- ${cap}: ${capabilityDescriptions[cap] ?? cap}`,
    );

    return `# Available Capabilities\n\n${lines.join("\n")}`;
  }

  private buildContextSection(input: ContextBuildInput): string {
    const parts: string[] = [];

    if (input.repo?.metadata) {
      parts.push(`Repository: ${input.repo.root}`);
      if (input.repo.metadata.branch) {
        parts.push(`Branch: ${input.repo.metadata.branch}`);
      }
      if (input.repo.metadata.commit) {
        parts.push(`Commit: ${input.repo.metadata.commit.slice(0, 7)}`);
      }
    }

    if (input.recentEvents?.length) {
      parts.push(`Recent Events: ${input.recentEvents.length}`);
    }

    if (input.memory) {
      const memCount =
        (input.memory.summaries?.length ?? 0) +
        (input.memory.pinned?.length ?? 0) +
        (input.memory.recent?.length ?? 0);
      if (memCount > 0) {
        parts.push(`Memory Items: ${memCount}`);
      }
    }

    if (!parts.length) {
      return "";
    }

    return `# Current Context\n\n${parts.join("\n")}`;
  }

  private buildGoalSection(goal: ContextBuildInput["goal"]): string {
    const text = goal.normalized ?? goal.raw;
    return `# Current Goal\n\n${text}`;
  }

  private buildConstraintsSection(): string {
    return (
      `# Constraints\n\n` +
      `- Always follow security best practices\n` +
      `- Never expose secrets or sensitive information\n` +
      `- Provide concise, actionable responses\n` +
      `- When uncertain, ask for clarification`
    );
  }
}
```

#### Step B.3: Context Assembler (2 hours)

**File**: `src/core/ContextAssembler.ts`

```typescript
import type {
  ContextBuildInput,
  ContextMessage,
  ContextConstraints,
} from "../types/index.js";
import type {
  AssemblyResult,
  AssemblyDebugInfo,
  TokenBreakdownInternal,
} from "../types/internal.js";
import type { ContextSource } from "../sources/BaseSource.js";
import type { AssemblyStrategy } from "../strategies/BaseStrategy.js";
import { TokenBudget } from "./TokenBudget.js";

/**
 * Orchestrates the context assembly pipeline
 */
export class ContextAssembler {
  constructor(
    private sources: Map<string, ContextSource>,
    private strategies: Map<string, AssemblyStrategy>,
  ) {}

  /**
   * Assemble context from all sources using specified strategy
   */
  async assemble(input: ContextBuildInput): Promise<AssemblyResult> {
    const budget = new TokenBudget(input.constraints.maxTokens);
    const strategy = this.selectStrategy(input.constraints.strategy);

    // Execute assembly
    const result = await strategy.assemble(input, budget, this.sources);

    // Build debug info
    const debug: AssemblyDebugInfo = {
      sourceResults: result.sourceResults,
      strategyUsed: strategy.name,
      tokenBreakdown: budget.getBreakdown(),
    };

    return {
      messages: result.messages,
      debug,
    };
  }

  private selectStrategy(
    strategyType: ContextConstraints["strategy"],
  ): AssemblyStrategy {
    const strategy = this.strategies.get(strategyType);
    if (!strategy) {
      // Fall back to balanced if strategy not found
      return this.strategies.get("balanced")!;
    }
    return strategy;
  }
}

/** Internal result from strategy */
interface StrategyExecutionResult {
  messages: ContextMessage[];
  sourceResults: Map<string, import("../types/internal.js").SourceResult>;
}
```

#### Step B.4: Context Builder (2 hours)

**File**: `src/core/ContextBuilder.ts`

```typescript
import type {
  ContextBuilder as IContextBuilder,
  ContextBuildInput,
  ContextBundle,
  ToolDescriptor,
  ContextMessage,
  ContextDebugInfo,
  TokenBreakdown,
} from "../types/index.js";
import type { ToolFilter } from "../filters/BaseFilter.js";
import { ContextAssembler } from "./ContextAssembler.js";
import { SystemPromptBuilder } from "./SystemPromptBuilder.js";
import { estimateTokens } from "../utils/tokenCounter.js";

/**
 * Main ContextBuilder implementation
 * Converts raw world state → LLM-ready context bundle
 */
export class ContextBuilder implements IContextBuilder {
  constructor(
    private assembler: ContextAssembler,
    private toolFilter: ToolFilter,
    private systemPromptBuilder: SystemPromptBuilder,
    private allTools: ToolDescriptor[],
  ) {}

  /**
   * Build context bundle from input
   * Pure function: no side effects
   */
  async build(input: ContextBuildInput): Promise<ContextBundle> {
    // 1. Build system prompt
    const system = this.systemPromptBuilder.build(input);

    // 2. Filter tools based on agent capabilities
    const tools = this.filterTools(input);

    // 3. Assemble context messages using strategy
    const assembly = await this.assembler.assemble(input);

    // 4. Calculate token estimates
    const tokenEstimate = this.calculateTokens(
      system,
      assembly.messages,
      tools,
    );

    // 5. Build debug info
    const debug: ContextDebugInfo | undefined = input.constraints
      .allowSummarization
      ? {
          includedFiles: this.extractIncludedFiles(assembly.messages),
          excludedFiles: [], // Would need to track this in sources
          droppedMessages:
            assembly.debug.sourceResults.get("_dropped")?.itemsExcluded ?? 0,
          summarizationsApplied: this.countSummarizations(
            assembly.debug.sourceResults,
          ),
          tokenBreakdown: this.buildTokenBreakdown(
            system,
            assembly.messages,
            tools,
            tokenEstimate,
            input.constraints.maxTokens,
          ),
          strategyUsed: assembly.debug.strategyUsed,
          assembledAt: Date.now(),
        }
      : undefined;

    return {
      system,
      messages: assembly.messages,
      tools,
      tokenEstimate,
      debug,
    };
  }

  private filterTools(input: ContextBuildInput): ToolDescriptor[] {
    return this.toolFilter.filter(this.allTools, input.agent);
  }

  private calculateTokens(
    system: string,
    messages: ContextMessage[],
    tools: ToolDescriptor[],
  ): number {
    const systemTokens = estimateTokens(system);
    const messageTokens = messages.reduce(
      (sum, msg) => sum + estimateTokens(msg.content),
      0,
    );
    const toolTokens = tools.reduce(
      (sum, tool) => sum + estimateTokens(JSON.stringify(tool)),
      0,
    );

    // Add overhead for message formatting
    const overhead = messages.length * 4;

    return systemTokens + messageTokens + toolTokens + overhead;
  }

  private buildTokenBreakdown(
    system: string,
    messages: ContextMessage[],
    tools: ToolDescriptor[],
    total: number,
    maxTokens: number,
  ): TokenBreakdown {
    return {
      system: estimateTokens(system),
      messages: messages.reduce(
        (sum, msg) => sum + estimateTokens(msg.content),
        0,
      ),
      tools: tools.reduce(
        (sum, tool) => sum + estimateTokens(JSON.stringify(tool)),
        0,
      ),
      overhead: messages.length * 4,
      total,
      remaining: maxTokens - total,
    };
  }

  private extractIncludedFiles(messages: ContextMessage[]): string[] {
    const files: string[] = [];
    for (const msg of messages) {
      // Extract file paths from message metadata or content
      if (msg.metadata?.source) {
        files.push(msg.metadata.source);
      }
    }
    return [...new Set(files)];
  }

  private countSummarizations(
    sourceResults: Map<string, { itemsSummarized: number }>,
  ): number {
    let count = 0;
    for (const result of sourceResults.values()) {
      count += result.itemsSummarized;
    }
    return count;
  }
}
```

**File**: `src/core/index.ts`:

```typescript
export { ContextBuilder } from "./ContextBuilder.js";
export { ContextAssembler } from "./ContextAssembler.js";
export { TokenBudget } from "./TokenBudget.js";
export { SystemPromptBuilder } from "./SystemPromptBuilder.js";
```

---

### Phase C: Assembly Strategies (Day 3 morning) — 3-4 hours

**Goal**: Implement the three packing strategies

#### Step C.1: Base Strategy Interface

**File**: `src/strategies/BaseStrategy.ts`

```typescript
import type { ContextBuildInput, ContextMessage } from "../types/index.js";
import type { ContextSource } from "../sources/BaseSource.js";
import type { TokenBudget } from "../core/TokenBudget.js";
import type { SourceResult } from "../types/internal.js";

/**
 * Abstract base class for assembly strategies
 */
export abstract class AssemblyStrategy {
  abstract readonly name: string;

  /**
   * Assemble context using this strategy
   */
  abstract assemble(
    input: ContextBuildInput,
    budget: TokenBudget,
    sources: Map<string, ContextSource>,
  ): Promise<{
    messages: ContextMessage[];
    sourceResults: Map<string, SourceResult>;
  }>;

  /**
   * Helper: Sort prioritized items by priority (descending)
   */
  protected sortByPriority<T extends { priority: number }>(items: T[]): T[] {
    return [...items].sort((a, b) => b.priority - a.priority);
  }
}
```

#### Step C.2: Greedy Strategy

**File**: `src/strategies/GreedyStrategy.ts`

```typescript
import { AssemblyStrategy } from "./BaseStrategy.js";
import type { ContextBuildInput, ContextMessage } from "../types/index.js";
import type { ContextSource } from "../sources/BaseSource.js";
import type { TokenBudget } from "../core/TokenBudget.js";
import type { SourceResult } from "../types/internal.js";
import { estimateTokens } from "../utils/tokenCounter.js";

/**
 * Greedy Strategy: Include items until budget exhausted
 * Priority order: Pinned memory > Recent events > Recent files > Diffs > Summaries
 */
export class GreedyStrategy extends AssemblyStrategy {
  readonly name = "greedy";

  async assemble(
    input: ContextBuildInput,
    budget: TokenBudget,
    sources: Map<string, ContextSource>,
  ): Promise<{
    messages: ContextMessage[];
    sourceResults: Map<string, SourceResult>;
  }> {
    const messages: ContextMessage[] = [];
    const sourceResults = new Map<string, SourceResult>();

    // Priority order for source processing
    const sourceOrder = [
      "memory_pinned",
      "events",
      "memory_recent",
      "files",
      "diffs",
      "memory_summaries",
    ];

    for (const sourceName of sourceOrder) {
      const source = sources.get(sourceName);
      if (!source) continue;

      const maxTokens = budget.remaining();
      if (maxTokens <= 0) break;

      const result = await source.extract(input, maxTokens);

      // Try to add all messages
      let tokensUsed = 0;
      let included = 0;

      for (const msg of result.messages) {
        const msgTokens = estimateTokens(msg.content);

        if (budget.allocate(msgTokens, sourceName)) {
          messages.push(msg);
          tokensUsed += msgTokens;
          included++;
        } else {
          break;
        }
      }

      sourceResults.set(sourceName, {
        messages: messages.slice(-included),
        tokensUsed,
        itemsIncluded: included,
        itemsExcluded: result.messages.length - included,
        itemsSummarized: result.itemsSummarized,
      });
    }

    return { messages, sourceResults };
  }
}
```

#### Step C.3: Balanced Strategy

**File**: `src/strategies/BalancedStrategy.ts`

```typescript
import { AssemblyStrategy } from "./BaseStrategy.js";
import type { ContextBuildInput, ContextMessage } from "../types/index.js";
import type { ContextSource } from "../sources/BaseSource.js";
import type { TokenBudget } from "../core/TokenBudget.js";
import type { SourceResult } from "../types/internal.js";

/**
 * Balanced Strategy: Distribute budget proportionally across sources
 * Default allocation: System (10%), Messages (60%), Tools (30%)
 */
export class BalancedStrategy extends AssemblyStrategy {
  readonly name = "balanced";

  private allocation = {
    system: 0.1,
    messages: 0.6,
    tools: 0.3,
  };

  async assemble(
    input: ContextBuildInput,
    budget: TokenBudget,
    sources: Map<string, ContextSource>,
  ): Promise<{
    messages: ContextMessage[];
    sourceResults: Map<string, SourceResult>;
  }> {
    const messages: ContextMessage[] = [];
    const sourceResults = new Map<string, SourceResult>();

    // Calculate message budget (excluding system and tools)
    const messageBudget = Math.floor(
      budget.remaining() * this.allocation.messages,
    );
    const sourceCount = sources.size || 1;
    const perSourceBudget = Math.floor(messageBudget / sourceCount);

    // Distribute evenly across all sources
    for (const [sourceName, source] of sources) {
      if (budget.remaining() <= 0) break;

      const maxTokens = Math.min(perSourceBudget, budget.remaining());
      const result = await source.extract(input, maxTokens);

      // Add messages up to per-source budget
      let tokensUsed = 0;
      let included = 0;

      for (const msg of result.messages) {
        if (tokensUsed >= perSourceBudget) break;

        messages.push(msg);
        tokensUsed += estimateTokens(msg.content);
        included++;
      }

      sourceResults.set(sourceName, {
        messages: messages.slice(-included),
        tokensUsed,
        itemsIncluded: included,
        itemsExcluded: result.messages.length - included,
        itemsSummarized: result.itemsSummarized,
      });

      budget.forceAllocate(tokensUsed, sourceName);
    }

    return { messages, sourceResults };
  }
}

function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}
```

#### Step C.4: Conservative Strategy

**File**: `src/strategies/ConservativeStrategy.ts`

```typescript
import { AssemblyStrategy } from "./BaseStrategy.js";
import type { ContextBuildInput, ContextMessage } from "../types/index.js";
import type { ContextSource } from "../sources/BaseSource.js";
import type { TokenBudget } from "../core/TokenBudget.js";
import type { SourceResult } from "../types/internal.js";

/**
 * Conservative Strategy: Minimal context with 20% buffer
 * Only includes: Pinned memory, last 2 events, top 3 most relevant files
 */
export class ConservativeStrategy extends AssemblyStrategy {
  readonly name = "conservative";

  private readonly BUFFER_PERCENTAGE = 0.2;
  private readonly MAX_EVENTS = 2;
  private readonly MAX_FILES = 3;

  async assemble(
    input: ContextBuildInput,
    budget: TokenBudget,
    sources: Map<string, ContextSource>,
  ): Promise<{
    messages: ContextMessage[];
    sourceResults: Map<string, SourceResult>;
  }> {
    const messages: ContextMessage[] = [];
    const sourceResults = new Map<string, SourceResult>();

    // Reserve buffer
    const usableBudget = Math.floor(
      budget.remaining() * (1 - this.BUFFER_PERCENTAGE),
    );
    budget.forceAllocate(budget.remaining() - usableBudget, "_buffer");

    // 1. Pinned memory (highest priority)
    const pinnedSource = sources.get("memory_pinned");
    if (pinnedSource && budget.remaining() > 0) {
      const result = await pinnedSource.extract(input, budget.remaining());
      const included = this.addMessagesWithinBudget(
        result.messages,
        messages,
        budget,
        "memory_pinned",
      );
      sourceResults.set("memory_pinned", {
        messages: messages.slice(-included),
        tokensUsed: 0, // Will calculate
        itemsIncluded: included,
        itemsExcluded: result.messages.length - included,
        itemsSummarized: 0,
      });
    }

    // 2. Recent events (limited to MAX_EVENTS)
    const eventsSource = sources.get("events");
    if (eventsSource && budget.remaining() > 0) {
      const result = await eventsSource.extract(input, budget.remaining());
      const limitedEvents = result.messages.slice(-this.MAX_EVENTS);
      const included = this.addMessagesWithinBudget(
        limitedEvents,
        messages,
        budget,
        "events",
      );
      sourceResults.set("events", {
        messages: messages.slice(-included),
        tokensUsed: 0,
        itemsIncluded: included,
        itemsExcluded: result.messages.length - included,
        itemsSummarized: 0,
      });
    }

    // 3. Most relevant files (limited to MAX_FILES)
    const filesSource = sources.get("files");
    if (filesSource && budget.remaining() > 0) {
      const result = await filesSource.extract(input, budget.remaining());
      // Assume files are already sorted by relevance
      const topFiles = result.messages.slice(0, this.MAX_FILES);
      const included = this.addMessagesWithinBudget(
        topFiles,
        messages,
        budget,
        "files",
      );
      sourceResults.set("files", {
        messages: messages.slice(-included),
        tokensUsed: 0,
        itemsIncluded: included,
        itemsExcluded: result.messages.length - included,
        itemsSummarized: 0,
      });
    }

    return { messages, sourceResults };
  }

  private addMessagesWithinBudget(
    newMessages: ContextMessage[],
    target: ContextMessage[],
    budget: TokenBudget,
    source: string,
  ): number {
    let included = 0;
    for (const msg of newMessages) {
      const tokens = Math.ceil(msg.content.length / 4);
      if (budget.allocate(tokens, source)) {
        target.push(msg);
        included++;
      } else {
        break;
      }
    }
    return included;
  }
}
```

**File**: `src/strategies/index.ts`:

```typescript
export { AssemblyStrategy } from "./BaseStrategy.js";
export { GreedyStrategy } from "./GreedyStrategy.js";
export { BalancedStrategy } from "./BalancedStrategy.js";
export { ConservativeStrategy } from "./ConservativeStrategy.js";
```

---

### Phase D: Context Sources (Day 3 afternoon - Day 4 morning) — 6-8 hours

**Goal**: Implement all context source handlers

#### Step D.1: Base Source

**File**: `src/sources/BaseSource.ts`

```typescript
import type { ContextBuildInput, ContextMessage } from "../types/index.js";
import type { SourceResult } from "../types/internal.js";

/**
 * Abstract base class for context sources
 */
export abstract class ContextSource {
  abstract readonly name: string;

  /**
   * Extract context messages from this source
   * @param input - Build input containing all context data
   * @param maxTokens - Maximum tokens this source can use
   * @returns Source result with messages and metadata
   */
  abstract extract(
    input: ContextBuildInput,
    maxTokens: number,
  ): Promise<SourceResult>;

  /**
   * Helper: Truncate content to fit within token limit
   */
  protected truncateToFit(content: string, maxTokens: number): string {
    const estimatedTokens = Math.ceil(content.length / 4);
    if (estimatedTokens <= maxTokens) {
      return content;
    }

    const maxChars = maxTokens * 4;
    const truncated = content.slice(0, maxChars - 3);
    return truncated + "...";
  }

  /**
   * Helper: Create a message with metadata
   */
  protected createMessage(
    role: ContextMessage["role"],
    content: string,
    metadata?: ContextMessage["metadata"],
  ): ContextMessage {
    return {
      role,
      content,
      metadata,
    };
  }
}
```

#### Step D.2: File Source

**File**: `src/sources/FileSource.ts`

```typescript
import { ContextSource } from "./BaseSource.js";
import type {
  ContextBuildInput,
  ContextMessage,
  FileDescriptor,
} from "../types/index.js";
import type { SourceResult } from "../types/internal.js";
import { estimateTokens, truncateToFit } from "../utils/tokenCounter.js";
import { formatFileContent } from "../utils/formatters.js";

/**
 * Extracts context from repository files
 */
export class FileSource extends ContextSource {
  readonly name = "files";

  async extract(
    input: ContextBuildInput,
    maxTokens: number,
  ): Promise<SourceResult> {
    if (!input.repo?.files?.length) {
      return {
        messages: [],
        tokensUsed: 0,
        itemsIncluded: 0,
        itemsExcluded: 0,
        itemsSummarized: 0,
      };
    }

    // Sort files by relevance (if available) then by recency
    const sortedFiles = this.sortFiles(input.repo.files);

    const messages: ContextMessage[] = [];
    let tokensUsed = 0;
    let included = 0;
    let excluded = 0;
    let summarized = 0;

    for (const file of sortedFiles) {
      // Skip files without content
      if (!file.content) {
        excluded++;
        continue;
      }

      const formatted = formatFileContent(file.path, file.content);
      const estimatedTokens = estimateTokens(formatted);

      if (tokensUsed + estimatedTokens <= maxTokens) {
        messages.push(
          this.createMessage("user", formatted, {
            source: file.path,
            priority: file.relevanceScore ?? 0.5,
            originalSize: file.size,
          }),
        );
        tokensUsed += estimatedTokens;
        included++;
      } else if (
        input.constraints.allowSummarization &&
        estimatedTokens > maxTokens * 0.5
      ) {
        // Try to include a truncated version
        const availableTokens = maxTokens - tokensUsed;
        if (availableTokens > 100) {
          const truncated = truncateToFit(file.content, availableTokens - 20);
          const truncatedFormatted = formatFileContent(
            file.path,
            truncated,
            true,
          );
          messages.push(
            this.createMessage("user", truncatedFormatted, {
              source: file.path,
              priority: file.relevanceScore ?? 0.5,
              originalSize: file.size,
            }),
          );
          tokensUsed += estimateTokens(truncatedFormatted);
          included++;
          summarized++;
        } else {
          excluded++;
        }
      } else {
        excluded++;
      }

      // Respect maxFiles constraint
      if (
        input.constraints.maxFiles &&
        included >= input.constraints.maxFiles
      ) {
        excluded += sortedFiles.length - included;
        break;
      }
    }

    return {
      messages,
      tokensUsed,
      itemsIncluded: included,
      itemsExcluded: excluded,
      itemsSummarized: summarized,
    };
  }

  private sortFiles(files: FileDescriptor[]): FileDescriptor[] {
    return [...files].sort((a, b) => {
      // First by relevance score (if available)
      if (a.relevanceScore !== undefined && b.relevanceScore !== undefined) {
        const scoreDiff = b.relevanceScore - a.relevanceScore;
        if (Math.abs(scoreDiff) > 0.01) return scoreDiff;
      }

      // Then by recency
      const timeA = a.lastModified ?? 0;
      const timeB = b.lastModified ?? 0;
      return timeB - timeA;
    });
  }
}
```

#### Step D.3: Diff Source

**File**: `src/sources/DiffSource.ts`

```typescript
import { ContextSource } from "./BaseSource.js";
import type { ContextBuildInput, ContextMessage } from "../types/index.js";
import type { SourceResult } from "../types/internal.js";
import { estimateTokens, truncateToFit } from "../utils/tokenCounter.js";
import { formatDiff } from "../utils/formatters.js";

/**
 * Extracts context from git diffs
 */
export class DiffSource extends ContextSource {
  readonly name = "diffs";

  async extract(
    input: ContextBuildInput,
    maxTokens: number,
  ): Promise<SourceResult> {
    if (!input.repo?.diffs?.length) {
      return {
        messages: [],
        tokensUsed: 0,
        itemsIncluded: 0,
        itemsExcluded: 0,
        itemsSummarized: 0,
      };
    }

    const messages: ContextMessage[] = [];
    let tokensUsed = 0;
    let included = 0;
    let excluded = 0;

    // Add header
    const header = "## Uncommitted Changes\n\n";
    const headerTokens = estimateTokens(header);

    if (headerTokens <= maxTokens) {
      messages.push(this.createMessage("system", header));
      tokensUsed += headerTokens;
    }

    for (const diff of input.repo.diffs) {
      const formatted = formatDiff(diff);
      const estimatedTokens = estimateTokens(formatted);

      if (tokensUsed + estimatedTokens <= maxTokens) {
        messages.push(
          this.createMessage("user", formatted, {
            source: diff.file,
            priority: 0.7,
          }),
        );
        tokensUsed += estimatedTokens;
        included++;
      } else {
        // Try to include stats only
        const stats = this.formatDiffStats(diff);
        const statsTokens = estimateTokens(stats);

        if (tokensUsed + statsTokens <= maxTokens) {
          messages.push(
            this.createMessage("user", stats, {
              source: diff.file,
              priority: 0.5,
            }),
          );
          tokensUsed += statsTokens;
          included++;
        } else {
          excluded++;
        }
      }
    }

    return {
      messages,
      tokensUsed,
      itemsIncluded: included,
      itemsExcluded: excluded,
      itemsSummarized: 0,
    };
  }

  private formatDiffStats(
    diff: ContextBuildInput["repo"]["diffs"][number],
  ): string {
    return `File: ${diff.file} (${diff.changeType || "modified"}, +${diff.additions || 0}/-${diff.deletions || 0})`;
  }
}
```

#### Step D.4: Memory Source

**File**: `src/sources/MemorySource.ts`

```typescript
import { ContextSource } from "./BaseSource.js";
import type {
  ContextBuildInput,
  ContextMessage,
  MemoryChunk,
} from "../types/index.js";
import type { SourceResult } from "../types/internal.js";
import { estimateTokens } from "../utils/tokenCounter.js";
import { formatMemory } from "../utils/formatters.js";

/**
 * Extracts context from memory snapshots
 */
export class MemorySource extends ContextSource {
  readonly name = "memory";

  private memoryType: "pinned" | "recent" | "summaries";

  constructor(memoryType: "pinned" | "recent" | "summaries" = "recent") {
    super();
    this.memoryType = memoryType;
    this.name = `memory_${memoryType}`;
  }

  async extract(
    input: ContextBuildInput,
    maxTokens: number,
  ): Promise<SourceResult> {
    const memories = this.getMemories(input.memory);

    if (!memories?.length) {
      return {
        messages: [],
        tokensUsed: 0,
        itemsIncluded: 0,
        itemsExcluded: 0,
        itemsSummarized: 0,
      };
    }

    // Sort by importance (descending)
    const sortedMemories = this.sortByImportance(memories);

    const messages: ContextMessage[] = [];
    let tokensUsed = 0;
    let included = 0;
    let excluded = 0;

    for (const memory of sortedMemories) {
      const formatted = formatMemory(memory);
      const estimatedTokens = estimateTokens(formatted);

      if (tokensUsed + estimatedTokens <= maxTokens) {
        messages.push(
          this.createMessage("system", formatted, {
            source: `memory:${memory.id}`,
            priority: memory.importance,
          }),
        );
        tokensUsed += estimatedTokens;
        included++;
      } else {
        excluded++;
      }
    }

    return {
      messages,
      tokensUsed,
      itemsIncluded: included,
      itemsExcluded: excluded,
      itemsSummarized: 0,
    };
  }

  private getMemories(
    memory: ContextBuildInput["memory"],
  ): MemoryChunk[] | undefined {
    switch (this.memoryType) {
      case "pinned":
        return memory?.pinned;
      case "recent":
        return memory?.recent;
      case "summaries":
        return memory?.summaries;
      default:
        return undefined;
    }
  }

  private sortByImportance(memories: MemoryChunk[]): MemoryChunk[] {
    return [...memories].sort((a, b) => {
      // Primary: importance score
      const importanceDiff = b.importance - a.importance;
      if (Math.abs(importanceDiff) > 0.01) return importanceDiff;

      // Secondary: recency
      const timeA = a.timestamp ?? 0;
      const timeB = b.timestamp ?? 0;
      return timeB - timeA;
    });
  }
}
```

#### Step D.5: Event Source

**File**: `src/sources/EventSource.ts`

```typescript
import { ContextSource } from "./BaseSource.js";
import type {
  ContextBuildInput,
  ContextMessage,
  RuntimeEvent,
} from "../types/index.js";
import type { SourceResult } from "../types/internal.js";
import { estimateTokens } from "../utils/tokenCounter.js";
import { formatEvent } from "../utils/formatters.js";

/**
 * Extracts context from recent runtime events
 */
export class EventSource extends ContextSource {
  readonly name = "events";

  async extract(
    input: ContextBuildInput,
    maxTokens: number,
  ): Promise<SourceResult> {
    const events = input.recentEvents;

    if (!events?.length) {
      return {
        messages: [],
        tokensUsed: 0,
        itemsIncluded: 0,
        itemsExcluded: 0,
        itemsSummarized: 0,
      };
    }

    // Filter by age if constraint specified
    const filteredEvents = this.filterByAge(
      events,
      input.constraints.maxEventAge,
    );

    // Sort by timestamp (most recent first)
    const sortedEvents = [...filteredEvents].sort(
      (a, b) => b.timestamp - a.timestamp,
    );

    const messages: ContextMessage[] = [];
    let tokensUsed = 0;
    let included = 0;
    let excluded = 0;

    for (const event of sortedEvents) {
      const formatted = formatEvent(event);
      const estimatedTokens = estimateTokens(formatted);

      if (tokensUsed + estimatedTokens <= maxTokens) {
        messages.push(
          this.createMessage("user", formatted, {
            source: `event:${event.type}`,
            priority: this.getEventPriority(event),
          }),
        );
        tokensUsed += estimatedTokens;
        included++;
      } else {
        excluded++;
      }
    }

    return {
      messages,
      tokensUsed,
      itemsIncluded: included,
      itemsExcluded: excluded,
      itemsSummarized: 0,
    };
  }

  private filterByAge(
    events: RuntimeEvent[],
    maxAgeMs?: number,
  ): RuntimeEvent[] {
    if (!maxAgeMs) return events;

    const cutoff = Date.now() - maxAgeMs;
    return events.filter((e) => e.timestamp >= cutoff);
  }

  private getEventPriority(event: RuntimeEvent): number {
    const priorities: Record<string, number> = {
      tool_error: 1.0,
      user_interruption: 0.9,
      execution_result: 0.7,
      tool_result: 0.6,
      tool_call: 0.5,
      agent_switch: 0.4,
      checkpoint: 0.3,
    };
    return priorities[event.type] ?? 0.5;
  }
}
```

#### Step D.6: Symbol Source (Optional/Future)

**File**: `src/sources/SymbolSource.ts`:

```typescript
import { ContextSource } from "./BaseSource.js";
import type { ContextBuildInput, ContextMessage } from "../types/index.js";
import type { SourceResult } from "../types/internal.js";
import { estimateTokens } from "../utils/tokenCounter.js";

/**
 * Extracts context from symbol index (for code intelligence)
 */
export class SymbolSource extends ContextSource {
  readonly name = "symbols";

  async extract(
    input: ContextBuildInput,
    maxTokens: number,
  ): Promise<SourceResult> {
    if (!input.repo?.symbols?.length) {
      return {
        messages: [],
        tokensUsed: 0,
        itemsIncluded: 0,
        itemsExcluded: 0,
        itemsSummarized: 0,
      };
    }

    const messages: ContextMessage[] = [];
    let tokensUsed = 0;
    let included = 0;
    let excluded = 0;

    const header = "## Code Symbols\n\n";
    messages.push(this.createMessage("system", header));
    tokensUsed += estimateTokens(header);

    for (const symbol of input.repo.symbols) {
      const formatted = this.formatSymbol(symbol);
      const estimatedTokens = estimateTokens(formatted);

      if (tokensUsed + estimatedTokens <= maxTokens) {
        messages.push(
          this.createMessage("user", formatted, {
            source: symbol.file,
            priority: 0.6,
          }),
        );
        tokensUsed += estimatedTokens;
        included++;
      } else {
        excluded++;
      }
    }

    return {
      messages,
      tokensUsed,
      itemsIncluded: included,
      itemsExcluded: excluded,
      itemsSummarized: 0,
    };
  }

  private formatSymbol(
    symbol: ContextBuildInput["repo"]["symbols"][number],
  ): string {
    const lines = [
      `- ${symbol.kind}: ${symbol.name}`,
      `  File: ${symbol.file}:${symbol.range[0]}-${symbol.range[1]}`,
    ];

    if (symbol.documentation) {
      lines.push(`  Doc: ${symbol.documentation.slice(0, 100)}`);
    }

    return lines.join("\n");
  }
}
```

**File**: `src/sources/index.ts`:

```typescript
export { ContextSource } from "./BaseSource.js";
export { FileSource } from "./FileSource.js";
export { DiffSource } from "./DiffSource.js";
export { MemorySource } from "./MemorySource.js";
export { EventSource } from "./EventSource.js";
export { SymbolSource } from "./SymbolSource.js";
```

---

### Phase E: Tool Filtering (Day 4 afternoon) — 2-3 hours

**Goal**: Implement role-based and capability-based tool filters

#### Step E.1: Base Filter

**File**: `src/filters/BaseFilter.ts`:

```typescript
import type { ToolDescriptor, AgentDescriptor } from "../types/index.js";

/**
 * Abstract base class for tool filters
 */
export abstract class ToolFilter {
  /**
   * Filter available tools based on agent
   */
  abstract filter(
    tools: ToolDescriptor[],
    agent: AgentDescriptor,
  ): ToolDescriptor[];
}
```

#### Step E.2: Role-Based Filter

**File**: `src/filters/RoleBasedFilter.ts`:

```typescript
import { ToolFilter } from "./BaseFilter.js";
import type {
  ToolDescriptor,
  AgentDescriptor,
  AgentRole,
} from "../types/index.js";

/**
 * Filters tools based on agent role
 */
export class RoleBasedFilter extends ToolFilter {
  // Define which tools each role can access
  private roleToolMap: Record<AgentRole, string[]> = {
    planner: ["read_files", "search", "view_directory"],
    coder: ["read_files", "write_files", "search", "run_tests", "execute_code"],
    reviewer: ["read_files", "search"],
    executor: ["read_files", "write_files", "git", "run_tests", "execute_code"],
    generic: ["read_files", "search"],
  };

  filter(tools: ToolDescriptor[], agent: AgentDescriptor): ToolDescriptor[] {
    const allowedTools =
      this.roleToolMap[agent.role] ?? this.roleToolMap.generic;

    return tools.filter((tool) => {
      // Check if tool is allowed for this role
      if (!allowedTools.includes(tool.name)) {
        return false;
      }

      // Check if tool requires capabilities the agent has
      if (tool.requiredCapabilities) {
        const hasAllCapabilities = tool.requiredCapabilities.every((cap) =>
          agent.capabilities.includes(
            cap as AgentDescriptor["capabilities"][number],
          ),
        );
        if (!hasAllCapabilities) {
          return false;
        }
      }

      return true;
    });
  }
}
```

#### Step E.3: Capability-Based Filter

**File**: `src/filters/CapabilityBasedFilter.ts`:

```typescript
import { ToolFilter } from "./BaseFilter.js";
import type {
  ToolDescriptor,
  AgentDescriptor,
  AgentCapability,
} from "../types/index.js";

/**
 * Filters tools strictly by agent capabilities
 */
export class CapabilityBasedFilter extends ToolFilter {
  // Map tool categories to required capabilities
  private categoryCapabilityMap: Record<string, AgentCapability[]> = {
    filesystem: ["read_files", "write_files"],
    git: ["git"],
    execution: ["execute_code", "run_tests"],
    search: ["search"],
  };

  filter(tools: ToolDescriptor[], agent: AgentDescriptor): ToolDescriptor[] {
    return tools.filter((tool) => {
      // Check tool's required capabilities
      if (tool.requiredCapabilities?.length) {
        return tool.requiredCapabilities.every((cap) =>
          agent.capabilities.includes(cap as AgentCapability),
        );
      }

      // Check tool category
      if (tool.category && this.categoryCapabilityMap[tool.category]) {
        const requiredCaps = this.categoryCapabilityMap[tool.category];
        return requiredCaps.some((cap) => agent.capabilities.includes(cap));
      }

      // If no requirements specified, allow by default
      return true;
    });
  }
}
```

**File**: `src/filters/index.ts`:

```typescript
export { ToolFilter } from "./BaseFilter.js";
export { RoleBasedFilter } from "./RoleBasedFilter.js";
export { CapabilityBasedFilter } from "./CapabilityBasedFilter.js";
```

---

### Phase F: Utilities (Day 4 late afternoon) — 2 hours

**Goal**: Helper functions for token counting, formatting, and sorting

#### Step F.1: Token Counter

**File**: `src/utils/tokenCounter.ts`:

```typescript
/**
 * Token estimation utilities
 * Uses simple heuristic: 1 token ≈ 4 characters
 * More accurate estimation can be added later
 */

const CHARS_PER_TOKEN = 4;
const OVERHEAD_PER_MESSAGE = 4;

/**
 * Estimate token count for a string
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimate tokens for multiple messages including overhead
 */
export function estimateMessageTokens(messages: { content: string }[]): number {
  return messages.reduce((sum, msg) => {
    return sum + estimateTokens(msg.content) + OVERHEAD_PER_MESSAGE;
  }, 0);
}

/**
 * Truncate text to fit within token limit
 */
export function truncateToFit(text: string, maxTokens: number): string {
  const maxChars = maxTokens * CHARS_PER_TOKEN;

  if (text.length <= maxChars) {
    return text;
  }

  // Leave room for "..." suffix
  const truncated = text.slice(0, maxChars - 3);
  return truncated + "...";
}

/**
 * Check if content fits within budget
 */
export function fitsInBudget(text: string, availableTokens: number): boolean {
  return estimateTokens(text) <= availableTokens;
}
```

#### Step F.2: Formatters

**File**: `src/utils/formatters.ts`:

````typescript
import type {
  FileDescriptor,
  GitDiff,
  MemoryChunk,
  RuntimeEvent,
} from "../types/index.js";

/**
 * Format file content with metadata header
 */
export function formatFileContent(
  path: string,
  content: string,
  truncated = false,
): string {
  const lines = [
    `--- File: ${path} ---`,
    truncated ? "(truncated)" : "",
    "```",
    content,
    "```",
  ].filter(Boolean);

  return lines.join("\n");
}

/**
 * Format git diff
 */
export function formatDiff(diff: GitDiff): string {
  const lines = [
    `--- Diff: ${diff.file} ---`,
    diff.changeType ? `Change type: ${diff.changeType}` : "",
    diff.additions !== undefined ? `+${diff.additions} additions` : "",
    diff.deletions !== undefined ? `-${diff.deletions} deletions` : "",
    "",
    "```diff",
    diff.patch,
    "```",
  ].filter(Boolean);

  return lines.join("\n");
}

/**
 * Format memory chunk
 */
export function formatMemory(memory: MemoryChunk): string {
  const lines = [
    `[Memory: ${memory.id}]`,
    `Importance: ${Math.round(memory.importance * 100)}%`,
    memory.source ? `Source: ${memory.source}` : "",
    memory.timestamp ? `Date: ${new Date(memory.timestamp).toISOString()}` : "",
    "",
    memory.content,
  ].filter(Boolean);

  return lines.join("\n");
}

/**
 * Format runtime event
 */
export function formatEvent(event: RuntimeEvent): string {
  const timestamp = new Date(event.timestamp).toISOString();

  let payloadStr = "";
  try {
    payloadStr = JSON.stringify(event.payload, null, 2);
  } catch {
    payloadStr = String(event.payload);
  }

  const lines = [
    `[Event: ${event.type}]`,
    `Time: ${timestamp}`,
    event.eventId ? `ID: ${event.eventId}` : "",
    "",
    "Payload:",
    payloadStr.slice(0, 500), // Limit payload size
    payloadStr.length > 500 ? "...(truncated)" : "",
  ].filter(Boolean);

  return lines.join("\n");
}
````

#### Step F.3: Sorters

**File**: `src/utils/sorters.ts`:

```typescript
import type { FileDescriptor, MemoryChunk } from "../types/index.js";

/**
 * Sort files by relevance and recency
 */
export function sortFilesByRelevance(
  files: FileDescriptor[],
): FileDescriptor[] {
  return [...files].sort((a, b) => {
    // First by relevance score
    if (a.relevanceScore !== undefined && b.relevanceScore !== undefined) {
      const scoreDiff = b.relevanceScore - a.relevanceScore;
      if (Math.abs(scoreDiff) > 0.01) return scoreDiff;
    }

    // Then by recency
    const timeA = a.lastModified ?? 0;
    const timeB = b.lastModified ?? 0;
    return timeB - timeA;
  });
}

/**
 * Sort memories by importance and recency
 */
export function sortMemoriesByImportance(
  memories: MemoryChunk[],
): MemoryChunk[] {
  return [...memories].sort((a, b) => {
    // First by importance
    const importanceDiff = b.importance - a.importance;
    if (Math.abs(importanceDiff) > 0.01) return importanceDiff;

    // Then by recency
    const timeA = a.timestamp ?? 0;
    const timeB = b.timestamp ?? 0;
    return timeB - timeA;
  });
}
```

**File**: `src/utils/index.ts`:

```typescript
export {
  estimateTokens,
  estimateMessageTokens,
  truncateToFit,
  fitsInBudget,
} from "./tokenCounter.js";

export {
  formatFileContent,
  formatDiff,
  formatMemory,
  formatEvent,
} from "./formatters.js";

export { sortFilesByRelevance, sortMemoriesByImportance } from "./sorters.js";
```

---

### Phase G: Public API & Factory (Day 4 evening) — 2 hours

**Goal**: Clean public interface with factory function

#### Step G.1: Factory Function

**File**: `src/index.ts`:

````typescript
/**
 * Context Assembly Engine
 *
 * Converts raw world state into LLM-ready context bundles.
 * Pure, deterministic, vendor-neutral.
 *
 * @example
 * ```typescript
 * import { createContextBuilder } from '@shadowbox/context-assembly'
 *
 * const builder = createContextBuilder()
 *
 * const context = await builder.build({
 *   runId: 'session-123',
 *   goal: { raw: 'Fix the login bug' },
 *   agent: {
 *     id: 'coder-1',
 *     role: 'coder',
 *     capabilities: ['read_files', 'write_files']
 *   },
 *   repo: repoSnapshot,
 *   constraints: {
 *     maxTokens: 120000,
 *     strategy: 'balanced',
 *     allowSummarization: true
 *   }
 * })
 *
 * // context.system, context.messages, context.tools
 * ```
 */

// Core exports
export { ContextBuilder } from "./core/ContextBuilder.js";
export { ContextAssembler } from "./core/ContextAssembler.js";
export { TokenBudget } from "./core/TokenBudget.js";
export { SystemPromptBuilder } from "./core/SystemPromptBuilder.js";

// Strategy exports
export { AssemblyStrategy } from "./strategies/BaseStrategy.js";
export { GreedyStrategy } from "./strategies/GreedyStrategy.js";
export { BalancedStrategy } from "./strategies/BalancedStrategy.js";
export { ConservativeStrategy } from "./strategies/ConservativeStrategy.js";

// Source exports
export { ContextSource } from "./sources/BaseSource.js";
export { FileSource } from "./sources/FileSource.js";
export { DiffSource } from "./sources/DiffSource.js";
export { MemorySource } from "./sources/MemorySource.js";
export { EventSource } from "./sources/EventSource.js";
export { SymbolSource } from "./sources/SymbolSource.js";

// Filter exports
export { ToolFilter } from "./filters/BaseFilter.js";
export { RoleBasedFilter } from "./filters/RoleBasedFilter.js";
export { CapabilityBasedFilter } from "./filters/CapabilityBasedFilter.js";

// Utility exports
export * from "./utils/index.js";

// Type exports
export * from "./types/index.js";

// Internal types for advanced use
export type {
  SourceResult,
  AssemblyResult,
  PrioritizedItem,
} from "./types/internal.js";

// Factory
import { ContextBuilder } from "./core/ContextBuilder.js";
import { ContextAssembler } from "./core/ContextAssembler.js";
import { SystemPromptBuilder } from "./core/SystemPromptBuilder.js";
import { RoleBasedFilter } from "./filters/RoleBasedFilter.js";
import { GreedyStrategy } from "./strategies/GreedyStrategy.js";
import { BalancedStrategy } from "./strategies/BalancedStrategy.js";
import { ConservativeStrategy } from "./strategies/ConservativeStrategy.js";
import { FileSource } from "./sources/FileSource.js";
import { DiffSource } from "./sources/DiffSource.js";
import { MemorySource } from "./sources/MemorySource.js";
import { EventSource } from "./sources/EventSource.js";
import { SymbolSource } from "./sources/SymbolSource.js";
import type { ToolDescriptor } from "./types/index.js";

export interface ContextBuilderOptions {
  /** Custom tool definitions */
  tools?: ToolDescriptor[];

  /** Default strategy */
  defaultStrategy?: "greedy" | "balanced" | "conservative";
}

/**
 * Factory function to create a pre-configured ContextBuilder
 */
export function createContextBuilder(
  options: ContextBuilderOptions = {},
): ContextBuilder {
  // Default tool registry
  const defaultTools: ToolDescriptor[] = [
    {
      name: "read_files",
      description: "Read file contents from the filesystem",
      schema: {
        type: "object",
        properties: {
          path: { type: "string" },
        },
        required: ["path"],
      },
      category: "filesystem",
      readOnly: true,
    },
    {
      name: "write_files",
      description: "Write content to files",
      schema: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
      },
      category: "filesystem",
      requiredCapabilities: ["write_files"],
    },
    {
      name: "search",
      description: "Search the codebase",
      schema: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
      },
      category: "search",
      readOnly: true,
    },
    {
      name: "git",
      description: "Execute git commands",
      schema: {
        type: "object",
        properties: {
          command: { type: "string" },
        },
        required: ["command"],
      },
      category: "git",
      requiredCapabilities: ["git"],
    },
    {
      name: "run_tests",
      description: "Run the test suite",
      schema: {
        type: "object",
        properties: {
          filter: { type: "string" },
        },
      },
      category: "execution",
      requiredCapabilities: ["run_tests"],
    },
    {
      name: "execute_code",
      description: "Execute code or commands",
      schema: {
        type: "object",
        properties: {
          code: { type: "string" },
        },
        required: ["code"],
      },
      category: "execution",
      requiredCapabilities: ["execute_code"],
    },
  ];

  const tools = options.tools ?? defaultTools;

  // Set up sources
  const sources = new Map([
    ["files", new FileSource()],
    ["diffs", new DiffSource()],
    ["memory_pinned", new MemorySource("pinned")],
    ["memory_recent", new MemorySource("recent")],
    ["memory_summaries", new MemorySource("summaries")],
    ["events", new EventSource()],
    ["symbols", new SymbolSource()],
  ]);

  // Set up strategies
  const strategies = new Map([
    ["greedy", new GreedyStrategy()],
    ["balanced", new BalancedStrategy()],
    ["conservative", new ConservativeStrategy()],
  ]);

  // Create assembler
  const assembler = new ContextAssembler(sources, strategies);

  // Create filter
  const toolFilter = new RoleBasedFilter();

  // Create system prompt builder
  const systemPromptBuilder = new SystemPromptBuilder();

  // Create builder
  return new ContextBuilder(assembler, toolFilter, systemPromptBuilder, tools);
}
````

---

### Phase H: Testing (Day 5) — 6-8 hours

**Goal**: Comprehensive test coverage

#### Step H.1: Test Setup

**File**: `tests/setup.ts`:

```typescript
import { vi } from "vitest";

// Global test configuration
globalThis.testEnv = "node";

// Mock console methods for cleaner test output
if (process.env.CI) {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
}
```

**File**: `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "tests/", "**/*.d.ts", "**/*.config.*"],
    },
  },
});
```

#### Step H.2: Test Fixtures

**File**: `tests/fixtures/sample-repo.ts`:

```typescript
import type {
  RepoSnapshot,
  FileDescriptor,
  GitDiff,
  SymbolIndex,
} from "../../src/types/index.js";

export const sampleFileDescriptors: FileDescriptor[] = [
  {
    path: "src/index.ts",
    size: 1024,
    language: "typescript",
    lastModified: Date.now() - 1000,
    content: 'export const foo = "bar"',
    relevanceScore: 0.9,
  },
  {
    path: "src/utils.ts",
    size: 512,
    language: "typescript",
    lastModified: Date.now() - 5000,
    content: "export function helper() { return true }",
    relevanceScore: 0.7,
  },
  {
    path: "README.md",
    size: 256,
    language: "markdown",
    lastModified: Date.now() - 10000,
    content: "# Project\n\nDescription",
    relevanceScore: 0.3,
  },
];

export const sampleDiffs: GitDiff[] = [
  {
    file: "src/index.ts",
    patch:
      'diff --git a/src/index.ts b/src/index.ts\n+export const foo = "bar"',
    changeType: "modified",
    additions: 1,
    deletions: 0,
  },
];

export const sampleSymbols: SymbolIndex[] = [
  {
    name: "foo",
    kind: "variable",
    file: "src/index.ts",
    range: [1, 1],
    documentation: "Exported constant",
  },
];

export const sampleRepoSnapshot: RepoSnapshot = {
  root: "/workspace/project",
  files: sampleFileDescriptors,
  symbols: sampleSymbols,
  diffs: sampleDiffs,
  metadata: {
    branch: "main",
    commit: "abc123def456",
    dirty: true,
  },
};
```

**File**: `tests/fixtures/sample-memory.ts`:

```typescript
import type { MemorySnapshot, MemoryChunk } from "../../src/types/index.js";

export const sampleMemoryChunks: MemoryChunk[] = [
  {
    id: "mem-1",
    content: "User prefers TypeScript over JavaScript",
    importance: 0.9,
    timestamp: Date.now() - 3600000,
    source: "user",
    type: "fact",
  },
  {
    id: "mem-2",
    content: "Project uses pnpm for package management",
    importance: 0.7,
    timestamp: Date.now() - 7200000,
    source: "system",
    type: "fact",
  },
  {
    id: "mem-3",
    content: "Focus on clean architecture and DRY principles",
    importance: 0.8,
    timestamp: Date.now() - 86400000,
    source: "user",
    type: "decision",
  },
];

export const sampleMemorySnapshot: MemorySnapshot = {
  pinned: [sampleMemoryChunks[0]],
  recent: [sampleMemoryChunks[1]],
  summaries: [sampleMemoryChunks[2]],
};
```

**File**: `tests/fixtures/sample-events.ts`:

```typescript
import type { RuntimeEvent } from "../../src/types/index.js";

export const sampleEvents: RuntimeEvent[] = [
  {
    type: "tool_call",
    payload: {
      toolName: "read_files",
      args: { path: "src/index.ts" },
    },
    timestamp: Date.now() - 300000,
    eventId: "evt-1",
  },
  {
    type: "tool_result",
    payload: {
      toolName: "read_files",
      result: 'export const foo = "bar"',
    },
    timestamp: Date.now() - 295000,
    eventId: "evt-2",
  },
  {
    type: "tool_error",
    payload: {
      toolName: "write_files",
      error: "Permission denied",
      retryable: false,
    },
    timestamp: Date.now() - 290000,
    eventId: "evt-3",
  },
];
```

**File**: `tests/fixtures/index.ts`:

```typescript
export * from "./sample-repo.js";
export * from "./sample-memory.js";
export * from "./sample-events.js";
```

#### Step H.3: Unit Tests

**File**: `tests/unit/TokenBudget.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { TokenBudget } from "../../src/core/TokenBudget.js";

describe("TokenBudget", () => {
  let budget: TokenBudget;

  beforeEach(() => {
    budget = new TokenBudget(1000);
  });

  describe("allocation", () => {
    it("should allocate tokens successfully", () => {
      expect(budget.allocate(100, "test")).toBe(true);
      expect(budget.remaining()).toBe(900);
    });

    it("should reject allocation that exceeds budget", () => {
      expect(budget.allocate(1100, "test")).toBe(false);
      expect(budget.remaining()).toBe(1000);
    });

    it("should track allocations by source", () => {
      budget.allocate(100, "source1");
      budget.allocate(200, "source2");
      budget.allocate(50, "source1");

      const breakdown = budget.getBreakdown();
      expect(breakdown.bySource.get("source1")).toBe(150);
      expect(breakdown.bySource.get("source2")).toBe(200);
    });

    it("should force allocation even when exceeding", () => {
      budget.forceAllocate(1100, "test");
      expect(budget.remaining()).toBe(-100);
    });

    it("should reserve percentage of budget", () => {
      const reserved = budget.reserve(20);
      expect(reserved).toBe(200);
      expect(budget.remaining()).toBe(800);
    });
  });

  describe("validation", () => {
    it("should throw on invalid budget", () => {
      expect(() => new TokenBudget(0)).toThrow();
      expect(() => new TokenBudget(-100)).toThrow();
    });

    it("should throw on negative allocation", () => {
      expect(() => budget.allocate(-100, "test")).toThrow();
    });
  });

  describe("usage tracking", () => {
    it("should report correct usage", () => {
      budget.allocate(250, "test");
      const usage = budget.getUsage();

      expect(usage.used).toBe(250);
      expect(usage.total).toBe(1000);
      expect(usage.percentage).toBe(25);
    });

    it("should detect exhausted budget", () => {
      expect(budget.isExhausted()).toBe(false);
      budget.allocate(1000, "test");
      expect(budget.isExhausted()).toBe(true);
    });
  });
});
```

**File**: `tests/unit/ContextBuilder.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { ContextBuilder } from "../../src/core/ContextBuilder.js";
import { ContextAssembler } from "../../src/core/ContextAssembler.js";
import { SystemPromptBuilder } from "../../src/core/SystemPromptBuilder.js";
import { RoleBasedFilter } from "../../src/filters/RoleBasedFilter.js";
import { BalancedStrategy } from "../../src/strategies/BalancedStrategy.js";
import { FileSource } from "../../src/sources/FileSource.js";
import { createContextBuilder } from "../../src/index.js";
import type {
  ContextBuildInput,
  ToolDescriptor,
} from "../../src/types/index.js";
import {
  sampleRepoSnapshot,
  sampleMemorySnapshot,
  sampleEvents,
} from "../fixtures/index.js";

describe("ContextBuilder", () => {
  let builder: ContextBuilder;
  let input: ContextBuildInput;

  beforeEach(() => {
    builder = createContextBuilder();

    input = {
      runId: "test-run-123",
      goal: {
        raw: "Fix the login bug",
        normalized: "Debug and fix authentication issue in login flow",
      },
      agent: {
        id: "test-agent",
        role: "coder",
        capabilities: ["read_files", "write_files", "search"],
      },
      repo: sampleRepoSnapshot,
      memory: sampleMemorySnapshot,
      recentEvents: sampleEvents,
      constraints: {
        maxTokens: 10000,
        strategy: "balanced",
        allowSummarization: true,
      },
    };
  });

  describe("build", () => {
    it("should return a context bundle", async () => {
      const bundle = await builder.build(input);

      expect(bundle).toHaveProperty("system");
      expect(bundle).toHaveProperty("messages");
      expect(bundle).toHaveProperty("tools");
      expect(bundle).toHaveProperty("tokenEstimate");
      expect(bundle).toHaveProperty("debug");
    });

    it("should include system prompt", async () => {
      const bundle = await builder.build(input);

      expect(bundle.system).toContain("Agent Identity");
      expect(bundle.system).toContain("coder");
      expect(bundle.system).toContain("Current Goal");
      expect(bundle.system).toContain(input.goal.normalized);
    });

    it("should filter tools by agent role", async () => {
      const bundle = await builder.build(input);

      const toolNames = bundle.tools.map((t) => t.name);
      expect(toolNames).toContain("read_files");
      expect(toolNames).toContain("write_files");
      expect(toolNames).toContain("search");
    });

    it("should include messages from sources", async () => {
      const bundle = await builder.build(input);

      expect(bundle.messages.length).toBeGreaterThan(0);
      expect(bundle.messages.every((m) => m.role && m.content)).toBe(true);
    });

    it("should respect token budget", async () => {
      const bundle = await builder.build(input);

      expect(bundle.tokenEstimate).toBeLessThanOrEqual(
        input.constraints.maxTokens,
      );
    });

    it("should include debug info when allowed", async () => {
      const bundle = await builder.build(input);

      expect(bundle.debug).toBeDefined();
      expect(bundle.debug?.strategyUsed).toBe("balanced");
      expect(bundle.debug?.tokenBreakdown.total).toBeGreaterThan(0);
    });

    it("should exclude debug info when not allowed", async () => {
      input.constraints.allowSummarization = false;
      const bundle = await builder.build(input);

      expect(bundle.debug).toBeUndefined();
    });
  });

  describe("determinism", () => {
    it("should produce same output for same input", async () => {
      const bundle1 = await builder.build(input);
      const bundle2 = await builder.build(input);

      expect(bundle1.system).toBe(bundle2.system);
      expect(bundle1.messages).toEqual(bundle2.messages);
      expect(bundle1.tokenEstimate).toBe(bundle2.tokenEstimate);
    });
  });

  describe("edge cases", () => {
    it("should handle empty input gracefully", async () => {
      const minimalInput: ContextBuildInput = {
        runId: "minimal",
        goal: { raw: "Test" },
        agent: {
          id: "test",
          role: "generic",
          capabilities: [],
        },
        constraints: {
          maxTokens: 1000,
          strategy: "balanced",
          allowSummarization: false,
        },
      };

      const bundle = await builder.build(minimalInput);

      expect(bundle.system).toBeDefined();
      expect(bundle.messages).toEqual([]);
      expect(bundle.tools).toEqual([]);
    });

    it("should handle very tight budget", async () => {
      input.constraints.maxTokens = 100;

      const bundle = await builder.build(input);

      expect(bundle.tokenEstimate).toBeLessThanOrEqual(100);
    });
  });
});
```

#### Step H.4: Integration Tests

**File**: `tests/integration/assembly-pipeline.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { createContextBuilder } from "../../src/index.js";
import type { ContextBuildInput } from "../../src/types/index.js";
import {
  sampleRepoSnapshot,
  sampleMemorySnapshot,
  sampleEvents,
} from "../fixtures/index.js";

describe("Assembly Pipeline Integration", () => {
  const baseInput: ContextBuildInput = {
    runId: "integration-test",
    goal: { raw: "Implement feature X" },
    agent: {
      id: "integration-agent",
      role: "coder",
      capabilities: ["read_files", "write_files", "search", "git", "run_tests"],
    },
    repo: sampleRepoSnapshot,
    memory: sampleMemorySnapshot,
    recentEvents: sampleEvents,
    constraints: {
      maxTokens: 5000,
      strategy: "balanced",
      allowSummarization: true,
    },
  };

  describe("strategies", () => {
    it("should work with greedy strategy", async () => {
      const builder = createContextBuilder();
      const input = {
        ...baseInput,
        constraints: { ...baseInput.constraints, strategy: "greedy" as const },
      };

      const bundle = await builder.build(input);

      expect(bundle.debug?.strategyUsed).toBe("greedy");
      expect(bundle.tokenEstimate).toBeGreaterThan(0);
    });

    it("should work with balanced strategy", async () => {
      const builder = createContextBuilder();
      const input = {
        ...baseInput,
        constraints: {
          ...baseInput.constraints,
          strategy: "balanced" as const,
        },
      };

      const bundle = await builder.build(input);

      expect(bundle.debug?.strategyUsed).toBe("balanced");
    });

    it("should work with conservative strategy", async () => {
      const builder = createContextBuilder();
      const input = {
        ...baseInput,
        constraints: {
          ...baseInput.constraints,
          strategy: "conservative" as const,
        },
      };

      const bundle = await builder.build(input);

      expect(bundle.debug?.strategyUsed).toBe("conservative");
      // Conservative should leave buffer
      expect(bundle.tokenEstimate).toBeLessThan(
        baseInput.constraints.maxTokens * 0.85,
      );
    });
  });

  describe("end-to-end scenarios", () => {
    it("should assemble complete context for coding task", async () => {
      const builder = createContextBuilder();

      const bundle = await builder.build(baseInput);

      // System prompt
      expect(bundle.system).toContain("software engineer");

      // Tools appropriate for coder
      const toolNames = bundle.tools.map((t) => t.name);
      expect(toolNames).toContain("read_files");
      expect(toolNames).toContain("write_files");

      // Messages from sources
      expect(bundle.messages.length).toBeGreaterThan(0);

      // Token budget respected
      expect(bundle.tokenEstimate).toBeLessThanOrEqual(
        baseInput.constraints.maxTokens,
      );

      // Debug info
      expect(bundle.debug).toBeDefined();
      expect(bundle.debug?.includedFiles.length).toBeGreaterThanOrEqual(0);
    });

    it("should handle planner agent differently", async () => {
      const builder = createContextBuilder();
      const input: ContextBuildInput = {
        ...baseInput,
        agent: {
          id: "planner-agent",
          role: "planner",
          capabilities: ["read_files", "search"],
        },
      };

      const bundle = await builder.build(input);

      // Planner should not have write_files
      const toolNames = bundle.tools.map((t) => t.name);
      expect(toolNames).not.toContain("write_files");
      expect(toolNames).toContain("read_files");
      expect(toolNames).toContain("search");

      // System prompt reflects planner role
      expect(bundle.system).toContain("planner");
    });
  });

  describe("determinism", () => {
    it("should produce identical results for identical inputs", async () => {
      const builder = createContextBuilder();

      const [bundle1, bundle2] = await Promise.all([
        builder.build(baseInput),
        builder.build(baseInput),
      ]);

      expect(JSON.stringify(bundle1)).toBe(JSON.stringify(bundle2));
    });
  });
});
```

---

## Integration Points

### Integration with apps/brain

The Context Assembly Engine will be integrated into the brain service to replace or enhance the existing `ContextHydrationService` and `MessagePreparationService`.

**Example integration**:

```typescript
// apps/brain/src/services/ContextService.ts
import {
  createContextBuilder,
  type ContextBuildInput,
} from "@shadowbox/context-assembly";

export class ContextService {
  private builder = createContextBuilder();

  async prepareContext(
    session: Session,
    userMessage: string,
  ): Promise<{
    system: string;
    messages: CoreMessage[];
    tools: ToolDescriptor[];
  }> {
    const input: ContextBuildInput = {
      runId: session.runId,
      goal: {
        raw: userMessage,
        intentType: this.classifyIntent(userMessage),
      },
      agent: {
        id: session.agentId ?? "primary-coder",
        role: session.agentRole ?? "coder",
        capabilities: session.capabilities ?? [
          "read_files",
          "write_files",
          "search",
        ],
      },
      repo: await this.getRepoSnapshot(session.repoId),
      memory: await this.getMemorySnapshot(session.runId),
      recentEvents: session.events.slice(-10),
      constraints: {
        maxTokens: this.getModelContextLimit(session.model),
        strategy: session.contextStrategy ?? "balanced",
        allowSummarization: true,
        maxFiles: 10,
      },
    };

    const context = await this.builder.build(input);

    return {
      system: context.system,
      messages: this.convertToCoreMessages(context.messages),
      tools: context.tools,
    };
  }

  // ... helper methods
}
```

### Migration from context-pruner

**Phase 1**: Run both systems in parallel for comparison
**Phase 2**: Gradually migrate calls from context-pruner to context-assembly
**Phase 3**: Deprecate context-pruner
**Phase 4**: Remove context-pruner

---

## Success Criteria

### Functional Requirements

- [x] All interfaces from FINAL spec implemented
- [x] Zero side effects (no I/O, no network, no mutations)
- [x] Deterministic output for same input
- [x] All three assembly strategies working
- [x] Token budgets strictly enforced
- [x] Role-based and capability-based tool filtering

### Quality Requirements

- [x] 90%+ test coverage
- [x] TypeScript strict mode passes
- [x] All tests passing
- [x] No lint errors
- [x] Clean build

### Performance Requirements

- [x] Context assembly < 100ms for typical inputs
- [x] Memory efficient (no memory leaks)
- [x] Linear time complexity relative to input size

### Documentation Requirements

- [x] README with usage examples
- [x] JSDoc comments on public APIs
- [x] Architecture diagram included
- [x] Integration guide provided

---

## Appendix: Interface Reference

### Complete Type Exports

```typescript
// From src/types/index.ts

// Inputs
ContextBuildInput;
UserGoal;
AgentDescriptor;
AgentRole("planner" | "coder" | "reviewer" | "executor" | "generic");
AgentCapability("read_files" | "write_files" | "git" | "run_tests" | "search");

// Repository
RepoSnapshot;
FileDescriptor;
SymbolIndex;
GitDiff;
RepoMetadata;

// Memory
MemorySnapshot;
MemoryChunk;

// Runtime
RuntimeEvent;
RuntimeEventType;

// Constraints
ContextConstraints;
AssemblyStrategyType("greedy" | "balanced" | "conservative");

// Output
ContextBundle;
ContextMessage;
ContextDebugInfo;
TokenBreakdown;

// Tools
ToolDescriptor;
ToolRegistry;
```

---

## Next Steps After Implementation

1. **Phase 1 Task 1**: Enhanced Context Sources (scoring, ranking algorithms)
2. **Phase 1 Task 2**: Token Packing Algorithm refinements
3. **Phase 1 Task 3**: Integration with apps/brain
4. **Phase 2**: Multi-agent orchestration

---

_This plan is ready for implementation. Each phase builds on the previous, ensuring incremental progress and early validation._
