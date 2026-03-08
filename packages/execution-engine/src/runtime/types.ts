export interface RuntimeStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string | string[]): Promise<boolean | number>;
  list<T>(options?: {
    prefix?: string;
    start?: string;
    end?: string;
    limit?: number;
  }): Promise<Map<string, T>>;
}

export interface RuntimeDurableObjectState {
  storage: RuntimeStorage;
  blockConcurrencyWhile<T>(closure: () => Promise<T>): Promise<T>;
}

export type {
  RunStatus,
  OrchestratorBackend,
  WorkflowStep,
} from "@shadowbox/orchestrator-core";

import type { WorkflowStep } from "@shadowbox/orchestrator-core";

export type RunPhase = WorkflowStep;

export type AgentType = "coding" | "review" | "ci" | (string & {});
export type RuntimeHarnessId = "cloudflare-sandbox" | "local-sandbox";

export interface RepositoryContext {
  owner?: string;
  repo?: string;
  branch?: string;
  baseUrl?: string;
}

export type WorkspaceBootstrapStatus =
  | "ready"
  | "needs-auth"
  | "invalid-context"
  | "sync-failed";

export interface WorkspaceBootstrapRequest {
  runId: string;
  repositoryContext: RepositoryContext;
}

export interface WorkspaceBootstrapResult {
  status: WorkspaceBootstrapStatus;
  message?: string;
}

export interface WorkspaceBootstrapper {
  bootstrap(
    request: WorkspaceBootstrapRequest,
  ): Promise<WorkspaceBootstrapResult>;
}

export interface RunInput {
  agentType: AgentType;
  prompt: string;
  sessionId: string;
  providerId?: string;
  modelId?: string;
  harnessId?: RuntimeHarnessId;
  metadata?: Record<string, unknown>;
  // Phase 4: Repository context for workspace-aware operations
  repositoryContext?: RepositoryContext;
}

export interface RunOutput {
  content: string;
  finalSummary?: string;
}

/**
 * RunManifest - Immutable run configuration determined at creation.
 *
 * This manifest is frozen at run creation and enforced to remain immutable
 * throughout the run lifecycle. Mid-run changes to any field are invalid.
 * 
 * Backend selection follows deterministic precedence:
 * 1. Explicit orchestratorBackend from run creation input
 * 2. Platform default (execution-engine-v1)
 * 
 * Once set, backend cannot change. Mismatch errors fail fast with typed errors.
 */
export interface RunManifest {
  mode: "agentic";
  providerId: string | null;
  modelId: string | null;
  harness: RuntimeHarnessId;
  /** Orchestrator backend identifier - determines which executor handles this run. */
  orchestratorBackend: OrchestratorBackend;
}

export interface RunMetadata {
  prompt: string;
  manifest?: RunManifest;
  phaseSelectionSnapshots?: Partial<Record<RunPhase, RunManifest>>;
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

export type TaskType =
  | "analyze"
  | "edit"
  | "test"
  | "review"
  | "git"
  | "shell"
  | (string & {});

export type TaskStatus =
  | "PENDING"
  | "READY"
  | "RUNNING"
  | "DONE"
  | "FAILED"
  | "BLOCKED"
  | "CANCELLED"
  | "RETRYING";

export interface TaskInput {
  description: string;
  expectedOutput?: string;
  [key: string]: unknown;
}

export interface TaskOutput {
  content: string;
  artifacts?: string[];
  metadata?: Record<string, unknown>;
}

export interface TaskError {
  message: string;
  code?: string;
  stack?: string;
}

export interface SerializedTask {
  id: string;
  runId: string;
  type: TaskType;
  status: TaskStatus;
  dependencies: string[];
  input: TaskInput;
  output?: TaskOutput;
  error?: TaskError;
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskResult {
  taskId: string;
  status: TaskStatus;
  output?: TaskOutput;
  error?: TaskError;
  completedAt: Date;
}

export interface AgentCapability {
  name: string;
  description: string;
}

export interface ExecutionContext {
  runId: string;
  sessionId: string;
  dependencies: TaskResult[];
  modelId?: string;
  providerId?: string;
}

export interface SynthesisContext {
  runId: string;
  sessionId: string;
  completedTasks: SerializedTask[];
  originalPrompt: string;
  modelId?: string;
  providerId?: string;
}

export interface RuntimeTask {
  id: string;
  runId: string;
  type: TaskType;
  input: TaskInput;
}

export interface RuntimeExecutionService {
  execute(
    plugin: string,
    action: string,
    payload: Record<string, unknown>,
  ): Promise<unknown>;
}

export interface IAgent {
  readonly type: string;
  plan(
    context: import("./planner/index.js").PlanContext,
  ): Promise<import("./planner/PlanSchema.js").Plan>;
  executeTask(task: RuntimeTask, context: ExecutionContext): Promise<TaskResult>;
  synthesize(context: SynthesisContext): Promise<string>;
  getCapabilities(): AgentCapability[];
}

export interface IAgentRegistry {
  register(agent: IAgent): void;
  get(type: string): IAgent;
  has(type: string): boolean;
  getAvailableTypes(): string[];
}
