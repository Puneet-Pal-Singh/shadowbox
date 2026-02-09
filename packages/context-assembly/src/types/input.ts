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
