import {
  isGoldenFlowToolName,
  type GoldenFlowToolName,
} from "../contracts/CodingToolGateway.js";
import { executeAgenticLoopTool } from "./AgenticLoopToolExecutor.js";
import { AgenticLoopCancelledError } from "./AgenticLoop.js";
import { getToolPresentation } from "../lib/ToolPresentation.js";
import type { Run } from "../run/index.js";
import type { RunRepository } from "../run/index.js";
import type { RuntimeExecutionService, TaskResult } from "../types.js";
import type { RunEventRecorder } from "../events/index.js";
import type { PermissionApprovalStore } from "./PermissionApprovalStore.js";
import { resolveRunPermissionContext } from "./RunPermissionContextPolicy.js";
import { evaluateToolPermission } from "./RunRiskyActionPolicy.js";
import { PermissionGateError } from "./PermissionGateError.js";
import {
  ensureApprovalResolvedEventRecorded,
  waitForApprovalDecision,
} from "./RunApprovalWaitPolicy.js";
import type { RunEngineEnv } from "./RunEngineTypes.js";
import {
  recordLifecycleStep,
} from "./RunMetadataPolicy.js";

interface AgenticLoopToolCall {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
}

interface AgenticLoopCallbacks {
  executeTool?: (toolCall: AgenticLoopToolCall) => Promise<TaskResult>;
  onToolRequested: (toolCall: AgenticLoopToolCall) => Promise<void>;
  onToolStarted: (toolCall: AgenticLoopToolCall) => Promise<void>;
  onToolCompleted: (
    toolCall: AgenticLoopToolCall,
    result: unknown,
    executionTimeMs: number,
  ) => Promise<void>;
  onToolFailed: (
    toolCall: AgenticLoopToolCall,
    error: string,
    executionTimeMs: number,
  ) => Promise<void>;
}

export function buildAgenticLoopCallbacks(input: {
  run: Run;
  directExecutionService?: RuntimeExecutionService;
  runEventRecorder: RunEventRecorder;
  permissionApprovalStore: PermissionApprovalStore;
  runRepo: RunRepository;
  env: RunEngineEnv;
  runId: string;
}): AgenticLoopCallbacks {
  let hasMutationEvidence = false;
  const allowResumeGitPush = canResumeGitPushFromContinuation(input.run);
  return {
    executeTool: input.directExecutionService
      ? async (toolCall) =>
          executeDirectToolCall({
            run: input.run,
            toolCall,
            directExecutionService: input.directExecutionService!,
            runEventRecorder: input.runEventRecorder,
            permissionApprovalStore: input.permissionApprovalStore,
            runRepo: input.runRepo,
            env: input.env,
            runId: input.runId,
            hasMutationEvidence,
            allowResumeGitPush,
            setHasMutationEvidence: (value) => {
              hasMutationEvidence = value;
            },
          })
      : undefined,
    onToolRequested: async (toolCall) => {
      const toolPresentation = getToolPresentation(
        toolCall.toolName,
        toolCall.args,
      );
      await input.runEventRecorder.recordToolRequested({
        id: toolCall.id,
        type: toolCall.toolName,
        input: {
          ...toolCall.args,
          description: toolPresentation.description,
          displayText: toolPresentation.displayText,
        },
      });
    },
    onToolStarted: async (toolCall) => {
      await input.runEventRecorder.recordToolStarted({
        id: toolCall.id,
        type: toolCall.toolName,
      });
    },
    onToolCompleted: async (toolCall, result, executionTimeMs) => {
      if (toolCall.toolName === "write_file") {
        hasMutationEvidence = true;
      }
      await input.runEventRecorder.recordToolCompleted(
        {
          id: toolCall.id,
          type: toolCall.toolName,
        },
        result,
        executionTimeMs,
      );
    },
    onToolFailed: async (toolCall, error, executionTimeMs) => {
      await input.runEventRecorder.recordToolFailed(
        {
          id: toolCall.id,
          type: toolCall.toolName,
        },
        error,
        executionTimeMs,
      );
    },
  };
}

async function executeDirectToolCall(input: {
  run: Run;
  toolCall: AgenticLoopToolCall;
  directExecutionService: RuntimeExecutionService;
  runEventRecorder: RunEventRecorder;
  permissionApprovalStore: PermissionApprovalStore;
  runRepo: RunRepository;
  env: RunEngineEnv;
  runId: string;
  hasMutationEvidence: boolean;
  allowResumeGitPush: boolean;
  setHasMutationEvidence: (value: boolean) => void;
}): Promise<TaskResult> {
  const toolPresentation = getToolPresentation(
    input.toolCall.toolName,
    input.toolCall.args,
  );
  if (!isGoldenFlowToolName(input.toolCall.toolName)) {
    throw new Error(
      `Unsupported direct agentic tool: ${input.toolCall.toolName}`,
    );
  }

  const hasWorkspaceMutationEvidence =
    !input.hasMutationEvidence &&
    needsGitMutationEvidenceProbe(input.toolCall.toolName)
      ? await detectWorkspaceMutationEvidence(input.directExecutionService)
      : false;
  const hasMutationEvidence =
    input.hasMutationEvidence || hasWorkspaceMutationEvidence;
  if (hasWorkspaceMutationEvidence) {
    input.setHasMutationEvidence(true);
  }

  const permissionState =
    input.run.metadata.permissionContext?.state ??
    resolveRunPermissionContext(input.run.input).state;
  const permissionResult = await evaluateToolPermission({
    runId: input.run.id,
    sessionId: input.run.sessionId,
    origin: "agent",
    productMode: permissionState.productMode,
    workflowIntent: permissionState.workflowIntent,
    toolName: input.toolCall.toolName,
    toolArgs: input.toolCall.args,
    hasMutationEvidence,
    allowResumeGitPush: input.allowResumeGitPush,
    approvalStore: input.permissionApprovalStore,
  });
  if (permissionResult.kind === "ask") {
    recordLifecycleStep(
      input.run,
      "APPROVAL_WAIT",
      "structured approval request emitted",
    );
    await input.runEventRecorder.recordApprovalRequested(permissionResult.request);
    const approvalOutcome = await waitForApprovalDecision({
      request: permissionResult.request,
      env: input.env,
      runId: input.runId,
      runRepo: input.runRepo,
      permissionApprovalStore: input.permissionApprovalStore,
    });
    if (
      approvalOutcome.outcome === "approved" ||
      approvalOutcome.outcome === "denied" ||
      approvalOutcome.outcome === "aborted"
    ) {
      await ensureApprovalResolvedEventRecorded({
        runEventRecorder: input.runEventRecorder,
        requestId: permissionResult.request.requestId,
        decision:
          approvalOutcome.decision ??
          (approvalOutcome.outcome === "approved"
            ? "allow_once"
            : approvalOutcome.outcome === "aborted"
              ? "abort"
              : "deny"),
        status:
          approvalOutcome.outcome === "approved"
            ? "approved"
            : approvalOutcome.outcome === "aborted"
              ? "aborted"
              : "denied",
      });
    }
    if (approvalOutcome.outcome === "approved") {
      // Continue with the original tool call after approval is granted.
    } else if (approvalOutcome.outcome === "timed_out") {
      throw PermissionGateError.fromAsk(permissionResult.request);
    } else if (approvalOutcome.outcome === "cancelled") {
      throw new AgenticLoopCancelledError(
        "Run was cancelled while waiting for approval.",
      );
    } else if (approvalOutcome.outcome === "aborted") {
      throw PermissionGateError.fromDeny("Approval request was aborted.");
    } else {
      throw PermissionGateError.fromDeny("Approval request was denied.");
    }
  }

  if (permissionResult.kind === "deny") {
    throw PermissionGateError.fromDeny(permissionResult.reason);
  }

  const result = await executeAgenticLoopTool(input.directExecutionService, {
    taskId: input.toolCall.id,
    toolName: input.toolCall.toolName,
    toolInput: {
      description: toolPresentation.description,
      displayText: toolPresentation.displayText,
      ...input.toolCall.args,
      __runtimeFeatureFlags: resolveRuntimeFeatureFlags(
        input.run.input.metadata,
      ),
    },
    onOutputAppended: async (chunk) => {
      await input.runEventRecorder.recordToolOutputAppended(
        {
          id: input.toolCall.id,
          type: input.toolCall.toolName,
        },
        chunk,
      );
    },
  });
  if (input.toolCall.toolName === "write_file") {
    input.setHasMutationEvidence(true);
  }
  return result;
}

function needsGitMutationEvidenceProbe(toolName: GoldenFlowToolName): boolean {
  return (
    toolName === "git_stage" ||
    toolName === "git_commit" ||
    toolName === "git_push"
  );
}

async function detectWorkspaceMutationEvidence(
  executionService: RuntimeExecutionService,
): Promise<boolean> {
  try {
    const result = await executionService.execute("git", "git_status", {});
    const payload = extractJsonOutputPayload(result);
    if (!payload) {
      return false;
    }

    const hasStaged = payload.hasStaged === true;
    const hasUnstaged = payload.hasUnstaged === true;
    const files = Array.isArray(payload.files) ? payload.files : [];
    return hasStaged || hasUnstaged || files.length > 0;
  } catch {
    return false;
  }
}

function extractJsonOutputPayload(
  value: unknown,
): Record<string, unknown> | null {
  const record = toRecord(value);
  if (!record) {
    return null;
  }

  if (record.success === false) {
    return null;
  }

  const output = record.output;
  if (typeof output !== "string" || output.trim().length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(output) as unknown;
    return toRecord(parsed);
  } catch {
    return null;
  }
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function resolveRuntimeFeatureFlags(
  metadata: Record<string, unknown> | undefined,
): {
  ghCliLaneEnabled: boolean;
  ghCliCiEnabled: boolean;
  ghCliPrCommentEnabled: boolean;
} {
  const featureFlags =
    metadata?.featureFlags && typeof metadata.featureFlags === "object"
      ? (metadata.featureFlags as Record<string, unknown>)
      : undefined;

  const readBoolean = (value: unknown): boolean | undefined =>
    typeof value === "boolean" ? value : undefined;

  const ghCliLaneEnabled = readBoolean(featureFlags?.ghCliLaneEnabled) ?? false;
  const ghCliCiEnabled =
    readBoolean(featureFlags?.ghCliCiEnabled) ?? ghCliLaneEnabled;
  const ghCliPrCommentEnabled =
    readBoolean(featureFlags?.ghCliPrCommentEnabled) ?? false;
  return {
    ghCliLaneEnabled,
    ghCliCiEnabled,
    ghCliPrCommentEnabled,
  };
}

function canResumeGitPushFromContinuation(run: Run): boolean {
  const continuation = run.metadata.continuation;
  if (!continuation || continuation.failedToolName !== "git_push") {
    return false;
  }

  if (!continuation.hasTrustedGitCommitIdentity) {
    return false;
  }

  return continuation.completedGitSteps.some((step) =>
    /^Commit created:/i.test(step.trim()),
  );
}
