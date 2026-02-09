import type { MessageRole, AssemblyStrategy } from "./context.js";
import type { ToolDescriptor } from "./tools.js";

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
