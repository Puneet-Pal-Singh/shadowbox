// apps/brain/src/types/run.types.ts
// Phase 3A: Run entity types and state definitions

/**
 * Run Status State Machine
 * CREATED → PLANNING → RUNNING → COMPLETED
 *                    ↓            ↓
 *                 PAUSED       FAILED
 *                    ↓            ↓
 *                 RUNNING    CANCELLED
 */
export type RunStatus =
  | "CREATED"
  | "PLANNING"
  | "RUNNING"
  | "PAUSED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type AgentType = "coding" | "review" | "ci" | (string & {});

export interface RunInput {
  agentType: AgentType;
  prompt: string;
  sessionId: string;
  metadata?: Record<string, unknown>;
}

export interface RunOutput {
  content: string;
  finalSummary?: string;
}

export interface RunMetadata {
  prompt: string;
  planId?: string;
  completedAt?: string;
  error?: string;
  startedAt?: string;
}

export interface SerializedRun {
  id: string;
  sessionId: string;
  status: RunStatus;
  agentType: AgentType;
  input: RunInput;
  output?: RunOutput;
  metadata: RunMetadata;
  createdAt: string;
  updatedAt: string;
}

export interface RunResult {
  runId: string;
  status: RunStatus;
  taskCount: number;
  finalOutput?: string;
  cost: CostSnapshot;
}

export interface CostSnapshot {
  runId: string;
  totalCost: number;
  totalTokens: number;
  byModel: Record<string, ModelCost>;
}

export interface ModelCost {
  model: string;
  promptTokens: number;
  completionTokens: number;
  cost: number;
}

export interface TaskSummary {
  taskId: string;
  type: string;
  status: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  model: string;
}
