/**
 * Intent Classifier Types
 *
 * Pure type definitions - no implementations
 */

/**
 * Intent types for classifying user requests
 * Phase 1: observational only (EXECUTE, MODIFY_CODE)
 */
export enum IntentType {
  READ_CODE = "READ_CODE",
  MODIFY_CODE = "MODIFY_CODE",
  DEBUG = "DEBUG",
  SEARCH = "SEARCH",
  PLAN = "PLAN",
  EXECUTE = "EXECUTE",
  META = "META",
}

/**
 * Signal that contributed to intent classification
 */
export interface IntentSignal {
  /** Signal type */
  type: "keyword" | "pattern" | "context";
  /** Matched value */
  value: string;
  /** Associated intent */
  intent: IntentType;
}

/**
 * Result of intent classification
 */
export interface IntentClassification {
  /** Primary detected intent */
  primary: IntentType;
  /** Classification confidence level */
  confidence: "low" | "medium" | "high";
  /** All signals that contributed to classification */
  signals: IntentSignal[];
}

/**
 * Input for classification
 */
export interface ClassifierInput {
  /** User message to classify */
  message: string;
  /** Recent tool calls for context */
  recentToolCalls?: Array<{ toolName: string }>;
  /** Agent role for context */
  agentRole?: string;
  /** Run identifier */
  runId?: string;
}
