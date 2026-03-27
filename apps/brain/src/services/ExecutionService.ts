import { Env } from "../types/ai";
import { decryptToken } from "@shadowbox/github-bridge";
import {
  sanitizeLogPayload,
  sanitizeUnknownError,
} from "../core/security/LogSanitizer";
import { toCanonicalGitExecutionAction } from "../lib/gitExecutionActions";

const DEFAULT_EXECUTION_TIMEOUT_MS = 120_000;
const GIT_STATUS_TIMEOUT_MS = 12_000;
const GIT_MUTATION_TIMEOUT_MS = 20_000;
const EXECUTION_SESSION_REPO_PATH = ".";
const EXECUTION_LOG_POLL_INTERVAL_MS = 250;

interface SecureExecutionSession {
  sessionId: string;
  token: string;
}

interface SecureExecutionSessionResponse extends SecureExecutionSession {
  expiresAt: number;
}

interface SecureExecutionTaskResponse {
  taskId: string;
  status: "success" | "failure" | "timeout" | "cancelled";
  output?: string;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  metrics?: {
    duration: number;
    memoryUsed?: number;
  };
}

interface LegacyExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
}

interface SecureExecutionLogEntry {
  timestamp: number;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  source?: "stdout" | "stderr";
}

/**
 * ExecutionService - Handles plugin execution with secure token pass-through
 *
 * Following GEMINI.md:
 * - Brain (Control Plane) handles auth and orchestration
 * - Muscle (Data Plane) handles execution
 * - Tokens are passed securely from Brain to Muscle
 */
export class ExecutionService {
  private executionSessionPromise: Promise<SecureExecutionSession> | null = null;

  constructor(
    private env: Env,
    private sessionId: string,
    private runId: string,
    private userId?: string,
  ) {}

  async execute(
    plugin: string,
    action: string,
    payload: Record<string, unknown>,
    options?: {
      onOutput?: (chunk: {
        message: string;
        source?: "stdout" | "stderr";
        timestamp?: number;
      }) => Promise<void> | void;
    },
  ) {
    const executionAction = normalizeExecutionAction(plugin, action);
    let executionFinished = false;
    let logForwardingPromise: Promise<void> | null = null;
    console.log(
      `[ExecutionService] ${plugin}:${executionAction}`,
      sanitizeLogPayload(payload),
    );

    try {
      // Check if this is a git operation and we have a userId
      // If so, fetch and inject the GitHub token
      if (plugin === "git" && this.userId) {
        const token = await this.getGitHubToken(this.userId);
        if (token) {
          payload.token = token;
          console.log(
            `[ExecutionService] Injected GitHub token for ${executionAction}`,
          );
        }
      }

      const timeoutMs = resolveExecutionTimeoutMs(plugin, executionAction);
      const executionSession = await this.getExecutionSession();
      const taskId = createExecutionTaskId(plugin, executionAction);
      logForwardingPromise = options?.onOutput
        ? this.forwardExecutionLogs({
            sessionId: executionSession.sessionId,
            token: executionSession.token,
            timeoutMs,
            onOutput: options.onOutput,
            isFinished: () => executionFinished,
          })
        : null;
      let res: Awaited<ReturnType<Env["SECURE_API"]["fetch"]>>;
      try {
        res = await fetchWithTimeout(
          this.env.SECURE_API,
          `http://internal/api/v1/execute?session=${encodeURIComponent(this.sessionId)}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${executionSession.token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              sessionId: executionSession.sessionId,
              taskId,
              action: `${plugin}.execute`,
              params: { ...payload, runId: this.runId, action: executionAction },
              timeout: timeoutMs,
            }),
          },
          timeoutMs,
        );
      } finally {
        executionFinished = true;
      }

      if (!res.ok) {
        await logForwardingPromise;
        throw new Error(
          (await res.text()) || `Failed to execute ${plugin}:${action}`,
        );
      }

      const executionResult = await parseJsonResponse<SecureExecutionTaskResponse>(
        res,
      );
      await logForwardingPromise;
      return toLegacyExecutionResult(executionResult);
    } catch (error) {
      executionFinished = true;
      await logForwardingPromise;
      console.error(
        `[ExecutionService] Error:`,
        sanitizeUnknownError(error),
      );
      throw error;
    }
  }

  /**
   * Execute with explicit user context for token retrieval
   * This overload allows specifying userId at execution time
   */
  async executeWithUser(
    userId: string,
    plugin: string,
    action: string,
    payload: Record<string, unknown>,
  ) {
    // Temporarily set userId for this execution
    const previousUserId = this.userId;
    this.userId = userId;

    try {
      return await this.execute(plugin, action, payload);
    } finally {
      // Restore previous userId
      this.userId = previousUserId;
    }
  }

  /**
   * Fetch and decrypt GitHub token for a user
   * Tokens are stored encrypted in KV storage
   */
  private async getGitHubToken(userId: string): Promise<string | null> {
    try {
      const sessionData = await this.env.SESSIONS.get(`user_session:${userId}`);
      if (!sessionData) {
        console.log(`[ExecutionService] No session found for user ${userId}`);
        return null;
      }

      const session = JSON.parse(sessionData);
      if (!session.encryptedToken) {
        console.log(
          `[ExecutionService] No GitHub token in session for user ${userId}`,
        );
        return null;
      }

      // Decrypt the token
      const token = await decryptToken(
        session.encryptedToken,
        this.env.GITHUB_TOKEN_ENCRYPTION_KEY,
      );

      console.log(
        `[ExecutionService] Successfully retrieved GitHub token for user ${userId}`,
      );
      return token;
    } catch (error) {
      console.error(
        `[ExecutionService] Failed to get GitHub token:`,
        sanitizeUnknownError(error),
      );
      return null;
    }
  }

  async getArtifact(key: string): Promise<string> {
    const res = await fetchWithTimeout(
      this.env.SECURE_API,
      `http://internal/artifact?key=${encodeURIComponent(key)}`,
      undefined,
      DEFAULT_EXECUTION_TIMEOUT_MS,
    );
    if (!res.ok) return "[Error: Artifact not found]";
    return await res.text();
  }

  private async getExecutionSession(): Promise<SecureExecutionSession> {
    if (!this.executionSessionPromise) {
      this.executionSessionPromise = this.createExecutionSession();
    }

    try {
      return await this.executionSessionPromise;
    } catch (error) {
      this.executionSessionPromise = null;
      throw error;
    }
  }

  private async createExecutionSession(): Promise<SecureExecutionSession> {
    const response = await fetchWithTimeout(
      this.env.SECURE_API,
      `http://internal/api/v1/session?session=${encodeURIComponent(this.sessionId)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: this.runId,
          taskId: createSessionTaskId(this.sessionId),
          repoPath: EXECUTION_SESSION_REPO_PATH,
        }),
      },
      DEFAULT_EXECUTION_TIMEOUT_MS,
    );

    if (!response.ok) {
      throw new Error(
        (await response.text()) || "Failed to create secure execution session",
      );
    }

    const session = await parseJsonResponse<SecureExecutionSessionResponse>(
      response,
    );
    return {
      sessionId: session.sessionId,
      token: session.token,
    };
  }

  private async forwardExecutionLogs(input: {
    sessionId: string;
    token: string;
    timeoutMs: number;
    onOutput: (chunk: {
      message: string;
      source?: "stdout" | "stderr";
      timestamp?: number;
    }) => Promise<void> | void;
    isFinished: () => boolean;
  }): Promise<void> {
    let lastTimestamp: number | undefined;

    while (!input.isFinished()) {
      lastTimestamp = await this.pollExecutionLogs(
        input.sessionId,
        input.token,
        input.timeoutMs,
        lastTimestamp,
        input.onOutput,
      );
      await sleep(EXECUTION_LOG_POLL_INTERVAL_MS);
    }

    await this.pollExecutionLogs(
      input.sessionId,
      input.token,
      input.timeoutMs,
      lastTimestamp,
      input.onOutput,
    );
  }

  private async pollExecutionLogs(
    sessionId: string,
    token: string,
    timeoutMs: number,
    since: number | undefined,
    onOutput: (chunk: {
      message: string;
      source?: "stdout" | "stderr";
      timestamp?: number;
    }) => Promise<void> | void,
  ): Promise<number | undefined> {
    const query = new URLSearchParams({ sessionId });
    if (since !== undefined && since > 0) {
      query.set("since", String(since));
    }

    const response = await fetchWithTimeout(
      this.env.SECURE_API,
      `http://internal/api/v1/logs?${query.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      timeoutMs,
    );

    if (!response.ok) {
      return since;
    }

    const entries = parseExecutionLogStream(await response.text());
    let nextTimestamp = since;
    for (const entry of entries) {
      nextTimestamp = Math.max(nextTimestamp ?? 0, entry.timestamp);
      if (!entry.source) {
        continue;
      }
      await onOutput({
        message: entry.message,
        source: entry.source,
        timestamp: entry.timestamp,
      });
    }

    return nextTimestamp;
  }
}

function normalizeExecutionAction(plugin: string, action: string): string {
  if (plugin !== "git") {
    return action;
  }
  return toCanonicalGitExecutionAction(action);
}

function resolveExecutionTimeoutMs(plugin: string, action: string): number {
  if (plugin !== "git") {
    return DEFAULT_EXECUTION_TIMEOUT_MS;
  }

  if (action === "git_status") {
    return GIT_STATUS_TIMEOUT_MS;
  }

  return GIT_MUTATION_TIMEOUT_MS;
}

function createSessionTaskId(sessionId: string): string {
  return `brain-session-${sessionId}`;
}

function createExecutionTaskId(plugin: string, action: string): string {
  return `${plugin}-${action}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseExecutionLogStream(body: string): SecureExecutionLogEntry[] {
  if (!body.trim()) {
    return [];
  }

  const entries: SecureExecutionLogEntry[] = [];
  for (const block of body.split("\n\n")) {
    const line = block
      .split("\n")
      .map((value) => value.trim())
      .find((value) => value.startsWith("data: "));
    if (!line) {
      continue;
    }

    try {
      entries.push(
        JSON.parse(line.slice("data: ".length)) as SecureExecutionLogEntry,
      );
    } catch (error) {
      console.warn(
        "[ExecutionService] Failed to parse execution log entry:",
        sanitizeUnknownError(error),
      );
    }
  }

  return entries;
}

async function parseJsonResponse<T>(
  response: Awaited<ReturnType<Env["SECURE_API"]["fetch"]>>,
): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(
      `Expected JSON response from secure execution API: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function toLegacyExecutionResult(
  result: SecureExecutionTaskResponse,
): LegacyExecutionResult {
  if (result.status === "success") {
    return {
      success: true,
      output: result.output ?? "",
    };
  }

  return {
    success: false,
    error:
      result.error?.message ??
      `Task execution ended with status '${result.status}'`,
  };
}

async function fetchWithTimeout(
  service: Env["SECURE_API"],
  input: string,
  init: Parameters<Env["SECURE_API"]["fetch"]>[1],
  timeoutMs: number,
): Promise<Awaited<ReturnType<Env["SECURE_API"]["fetch"]>>> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Execution request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([service.fetch(input, init), timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function sleep(durationMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, durationMs));
}
