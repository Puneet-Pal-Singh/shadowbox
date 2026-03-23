import { CloudflareToolboxAdapter } from "../adapters/CloudflareToolboxAdapter";
import type {
  ToolboxExecutionResult,
  ToolboxSessionHandle,
  ToolboxSessionRequest,
} from "../contracts/ToolboxSession";
import { ToolboxEventFactory } from "../events/ToolboxEventFactory";
import { ToolboxPolicyService } from "../policies/ToolboxPolicyService";

export class ToolboxSessionService {
  private readonly eventFactory = new ToolboxEventFactory();
  private readonly policyService = new ToolboxPolicyService();

  constructor(private readonly adapter: CloudflareToolboxAdapter) {}

  async execute(
    request: ToolboxSessionRequest,
    allowlist: readonly string[],
  ): Promise<ToolboxExecutionResult> {
    const policy = this.policyService.evaluate(request, allowlist);
    if (policy.decision === "deny") {
      return this.buildDeniedResult(request, policy.reason ?? "Command denied");
    }

    const handle = this.createHandle(request);
    this.eventFactory.createRequested(handle);
    this.eventFactory.createStatus(handle, "started");

    const startedAt = Date.now();
    try {
      const command = buildShellCommand(request);
      const result = await runWithTimeout(
        this.adapter.execute(command),
        request.timeoutMs,
      );
      const status = result.exitCode === 0 ? "completed" : "failed";
      this.eventFactory.createStatus(handle, status);
      return {
        sessionId: handle.sessionId,
        runId: handle.runId,
        toolName: handle.toolName,
        callId: handle.callId,
        status,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      const isTimeout =
        error instanceof Error &&
        error.message === "Toolbox execution timed out";
      this.eventFactory.createStatus(handle, isTimeout ? "timeout" : "failed");
      return {
        sessionId: handle.sessionId,
        runId: handle.runId,
        toolName: handle.toolName,
        callId: handle.callId,
        status: isTimeout ? "timeout" : "failed",
        exitCode: isTimeout ? 124 : 1,
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
      };
    }
  }

  private createHandle(request: ToolboxSessionRequest): ToolboxSessionHandle {
    return {
      sessionId: createSessionId(request),
      runId: request.runId,
      toolName: request.toolName,
      callId: request.callId,
      status: "started",
      startedAt: Date.now(),
    };
  }

  private buildDeniedResult(
    request: ToolboxSessionRequest,
    reason: string,
  ): ToolboxExecutionResult {
    return {
      sessionId: createSessionId(request),
      runId: request.runId,
      toolName: request.toolName,
      callId: request.callId,
      status: "failed",
      exitCode: 1,
      stdout: "",
      stderr: reason,
      durationMs: 0,
    };
  }
}

function createSessionId(request: ToolboxSessionRequest): string {
  return `${request.runId}:${request.callId}:${request.toolName}:${crypto.randomUUID()}`;
}

function buildShellCommand(request: ToolboxSessionRequest): string {
  const escapedCommand = escapeShellArg(request.command);
  const escapedArgs = (request.args ?? []).map((arg) => escapeShellArg(arg));
  const commandExpr = [escapedCommand, ...escapedArgs].join(" ");

  if (!request.cwd) {
    return commandExpr;
  }

  return `cd ${escapeShellArg(request.cwd)} && ${commandExpr}`;
}

function escapeShellArg(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

async function runWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs?: number,
): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) {
    return promise;
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("Toolbox execution timed out"));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
