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
}

export interface SynthesisContext {
  runId: string;
  sessionId: string;
  completedTasks: SerializedTask[];
  originalPrompt: string;
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
