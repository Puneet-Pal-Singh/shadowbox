/**
 * Core context assembly types
 * Pure interfaces - no implementations
 */

/**
 * Unique identifier for a context assembly operation
 * Branded type for type safety
 */
export type RunId = string & { __brand: "RunId" };

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
