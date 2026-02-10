/**
 * Token Budgeting Types
 *
 * Pure type definitions for token budget management and enforcement
 */

/**
 * Model configuration metadata
 */
export interface ModelConfig {
  /** Model identifier (e.g., "gpt-4-turbo") */
  id: string;
  /** Human-readable name */
  name: string;
  /** Maximum tokens supported by model */
  maxTokens: number;
  /** Supported API methods */
  supportedMethods: string[];
}

/**
 * Budget bucket categories (ordered by priority)
 * SYSTEM (highest priority) → OPTIONAL (lowest priority)
 */
export enum BucketKind {
  SYSTEM = "SYSTEM",                      // System prompt (never drop)
  USER = "USER",                          // User message (never drop)
  REPO_SUMMARY = "REPO_SUMMARY",          // Repository metadata
  TOOLS = "TOOLS",                        // Tool definitions
  AGENT_CONTEXT = "AGENT_CONTEXT",        // Agent state/scratch
  OPTIONAL = "OPTIONAL",                  // Debug info, metadata
}

/**
 * Policy for handling over-budget bucket
 */
export enum TruncationPolicy {
  REJECT = "REJECT",              // Fail if can't fit (hard limit)
  TRUNCATE = "TRUNCATE",          // Truncate to fit remaining budget
  DROP = "DROP",                  // Remove entirely if over budget
}

/**
 * Single component of context to be budgeted
 */
export interface ContextComponent {
  /** Which bucket this belongs to */
  bucket: BucketKind;
  /** Text content */
  content: string;
  /** Optional human-readable label */
  label?: string;
  /** Optional metadata for reporting */
  metadata?: Record<string, unknown>;
}

/**
 * Budget allocation for a single bucket
 */
export interface BucketBudget {
  /** Bucket kind */
  kind: BucketKind;
  /** Maximum tokens (null = no hard limit, use available) */
  maxTokens: number | null;
  /** Policy when over limit */
  policy: TruncationPolicy;
  /** Priority (0 = highest, processed first) */
  priority: number;
}

/**
 * Context component with calculated token info
 */
export interface ContextWithTokens extends ContextComponent {
  /** Estimated tokens in original content */
  estimatedTokens: number;
  /** Tokens allocated/used (may be less if truncated) */
  allocatedTokens: number;
  /** Content after truncation (if truncated) */
  truncatedContent?: string;
  /** Whether this component was dropped entirely */
  dropped?: boolean;
}

/**
 * Decision made for a single bucket
 */
export interface BucketDecision {
  /** Which bucket this decision applies to */
  kind: BucketKind;
  /** Whether this bucket is included in final context */
  included: boolean;
  /** Tokens allocated (0 if dropped) */
  allocatedTokens: number;
  /** Human-readable reason for decision */
  reason: string;
  /** Whether content was truncated (not just dropped) */
  truncated?: boolean;
  /** Truncated content (if applicable) */
  truncatedContent?: string;
}

/**
 * Main output: budgeted context plan with enforcement
 */
export interface BudgetedContextPlan {
  /** Model being used */
  modelConfig: ModelConfig;
  /** Total tokens available in model */
  totalAvailableTokens: number;
  /** Tokens reserved for model output */
  reservedOutputTokens: number;
  /** Remaining tokens for input after reserve */
  availableForInput: number;

  /** Decision for each bucket */
  decisions: BucketDecision[];

  /** Total tokens allocated across all buckets */
  totalAllocatedTokens: number;

  /** Safety verification */
  safety: {
    /** Remaining tokens (should be >= 0) */
    remaining: number;
    /** Percentage of available tokens used */
    utilization: number;
    /** Whether plan is within all limits */
    withinLimit: boolean;
  };

  /** Processed components (may be truncated/dropped) */
  components: ContextWithTokens[];

  /** Any validation or safety issues found */
  errors: string[];
}

/**
 * Human-readable budget report for observability
 */
export interface BudgetReport {
  /** When analysis was performed */
  timestamp: string; // ISO string
  /** Model being analyzed */
  modelConfig: ModelConfig;
  /** Detailed analysis */
  analysis: {
    /** Total tokens in final plan */
    totalTokens: number;
    /** Tokens per bucket */
    perBucket: Record<BucketKind, number>;
    /** Buckets that were dropped */
    dropped: BucketKind[];
    /** Buckets that were truncated */
    truncated: BucketKind[];
  };
  /** Decision details */
  decisions: BucketDecision[];
  /** Summary recommendation */
  recommendation: string;
}
