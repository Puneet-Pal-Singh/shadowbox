import {
  safeParseToolActivityMetadata,
  ACTIVITY_PART_KINDS,
  HANDOFF_ACTIVITY_STATUSES,
  REASONING_ACTIVITY_STATUSES,
  RUN_EVENT_TYPES,
  RUN_WORKFLOW_STEPS,
  TOOL_ACTIVITY_FAMILIES,
  TOOL_ACTIVITY_STATUSES,
  type ActivityFeedSnapshot,
  type ActivityPart,
  type ApprovalActivityPart,
  type HandoffActivityPart,
  type ReasoningActivityPart,
  type RunEvent,
  type ToolActivityMetadata,
  type ToolActivityPart,
} from "@repo/shared-types";
import type { SerializedRun } from "../types.js";

const UNKNOWN_ACTIVITY_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const SHELL_OUTPUT_TAIL_CAP = 128 * 1024;
const SHELL_STREAM_CAP_PER_CHANNEL = SHELL_OUTPUT_TAIL_CAP / 2;

interface ProjectRunActivityFeedParams {
  runId: string;
  run: Pick<SerializedRun, "id" | "sessionId" | "status" | "metadata"> | null;
  events: RunEvent[];
}

export function projectRunActivityFeed(
  params: ProjectRunActivityFeedParams,
): ActivityFeedSnapshot {
  const { runId, run } = params;
  const events = [...params.events].sort((left, right) =>
    left.timestamp.localeCompare(right.timestamp),
  );
  const items: ActivityPart[] = [];
  const toolParts = new Map<string, ToolActivityPart>();
  let turnIndex = 0;
  let currentTurnId: string | undefined;

  for (const event of events) {
    currentTurnId = updateTurnId(currentTurnId, event, () => {
      turnIndex += 1;
      return `turn-${turnIndex}`;
    });

    switch (event.type) {
      case RUN_EVENT_TYPES.MESSAGE_EMITTED:
        items.push(createTextPart(event, currentTurnId));
        break;
      case RUN_EVENT_TYPES.RUN_STATUS_CHANGED: {
        const part = createReasoningPart(event, currentTurnId);
        if (part) {
          items.push(part);
        }
        break;
      }
      case RUN_EVENT_TYPES.TOOL_REQUESTED: {
        const part = createRequestedToolPart(event, currentTurnId);
        toolParts.set(part.toolId, part);
        items.push(part);
        break;
      }
      case RUN_EVENT_TYPES.TOOL_STARTED:
        updateToolPart(toolParts, event.payload.toolId, {
          status: TOOL_ACTIVITY_STATUSES.RUNNING,
          updatedAt: event.timestamp,
          startedAt: event.timestamp,
        });
        break;
      case RUN_EVENT_TYPES.TOOL_OUTPUT_APPENDED:
        appendToolOutput(toolParts, event);
        break;
      case RUN_EVENT_TYPES.TOOL_COMPLETED:
        applyToolCompletion(toolParts, event);
        break;
      case RUN_EVENT_TYPES.TOOL_FAILED:
        applyToolFailure(toolParts, event);
        break;
      default:
        break;
    }
  }

  items.push(...createApprovalParts(run, currentTurnId));
  const handoffPart = createHandoffPart(run, currentTurnId);
  if (handoffPart) {
    items.push(handoffPart);
  }

  return {
    runId,
    sessionId: run?.sessionId,
    status: run?.status ?? null,
    items: items.sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    ),
  };
}

function updateTurnId(
  currentTurnId: string | undefined,
  event: RunEvent,
  createTurnId: () => string,
): string | undefined {
  if (
    event.type === RUN_EVENT_TYPES.MESSAGE_EMITTED &&
    event.payload.role === "user"
  ) {
    return createTurnId();
  }
  return currentTurnId;
}

function createTextPart(
  event: Extract<RunEvent, { type: typeof RUN_EVENT_TYPES.MESSAGE_EMITTED }>,
  turnId: string | undefined,
): ActivityPart {
  return {
    id: event.eventId,
    runId: event.runId,
    sessionId: event.sessionId,
    turnId,
    kind: ACTIVITY_PART_KINDS.TEXT,
    createdAt: event.timestamp,
    updatedAt: event.timestamp,
    source: event.source,
    role: event.payload.role,
    content: event.payload.content,
  };
}

function createReasoningPart(
  event: Extract<RunEvent, { type: typeof RUN_EVENT_TYPES.RUN_STATUS_CHANGED }>,
  turnId: string | undefined,
): ReasoningActivityPart | null {
  const workflowStep = event.payload.workflowStep;
  if (!workflowStep) {
    return null;
  }

  return {
    id: event.eventId,
    runId: event.runId,
    sessionId: event.sessionId,
    turnId,
    kind: ACTIVITY_PART_KINDS.REASONING,
    createdAt: event.timestamp,
    updatedAt: event.timestamp,
    source: event.source,
    label: getReasoningLabel(workflowStep),
    summary: event.payload.reason?.trim() || getReasoningSummary(workflowStep),
    phase: workflowStep,
    status: REASONING_ACTIVITY_STATUSES.COMPLETED,
  };
}

function createRequestedToolPart(
  event: Extract<RunEvent, { type: typeof RUN_EVENT_TYPES.TOOL_REQUESTED }>,
  turnId: string | undefined,
): ToolActivityPart {
  return {
    id: event.eventId,
    runId: event.runId,
    sessionId: event.sessionId,
    turnId,
    kind: ACTIVITY_PART_KINDS.TOOL,
    createdAt: event.timestamp,
    updatedAt: event.timestamp,
    source: event.source,
    toolId: event.payload.toolId,
    toolName: event.payload.toolName,
    status: TOOL_ACTIVITY_STATUSES.REQUESTED,
    input: event.payload.arguments,
    metadata: buildToolMetadata(
      event.payload.toolName,
      event.payload.arguments,
      undefined,
      undefined,
    ),
  };
}

function applyToolCompletion(
  toolParts: Map<string, ToolActivityPart>,
  event: Extract<RunEvent, { type: typeof RUN_EVENT_TYPES.TOOL_COMPLETED }>,
): void {
  const part = toolParts.get(event.payload.toolId);
  if (!part) {
    return;
  }
  part.status = TOOL_ACTIVITY_STATUSES.COMPLETED;
  part.updatedAt = event.timestamp;
  part.startedAt = part.startedAt ?? event.timestamp;
  part.endedAt = event.timestamp;
  part.output = event.payload.result;
  part.metadata = mergeToolMetadata(
    part.metadata,
    buildToolMetadata(part.toolName, part.input, event.payload.result, undefined),
  );
}

function applyToolFailure(
  toolParts: Map<string, ToolActivityPart>,
  event: Extract<RunEvent, { type: typeof RUN_EVENT_TYPES.TOOL_FAILED }>,
): void {
  const part = toolParts.get(event.payload.toolId);
  if (!part) {
    return;
  }
  part.status = TOOL_ACTIVITY_STATUSES.FAILED;
  part.updatedAt = event.timestamp;
  part.startedAt = part.startedAt ?? event.timestamp;
  part.endedAt = event.timestamp;
  part.output = { error: event.payload.error };
  part.metadata = mergeToolMetadata(
    part.metadata,
    buildToolMetadata(part.toolName, part.input, undefined, event.payload.error),
  );
}

function appendToolOutput(
  toolParts: Map<string, ToolActivityPart>,
  event: Extract<RunEvent, { type: typeof RUN_EVENT_TYPES.TOOL_OUTPUT_APPENDED }>,
): void {
  const part = toolParts.get(event.payload.toolId);
  if (!part || part.metadata.family !== TOOL_ACTIVITY_FAMILIES.SHELL) {
    return;
  }

  const nextStdout = appendCappedText(
    part.metadata.stdout,
    event.payload.stdoutDelta,
    SHELL_STREAM_CAP_PER_CHANNEL,
  );
  const nextStderr = appendCappedText(
    part.metadata.stderr,
    event.payload.stderrDelta,
    SHELL_STREAM_CAP_PER_CHANNEL,
  );

  part.status = TOOL_ACTIVITY_STATUSES.RUNNING;
  part.updatedAt = event.timestamp;
  part.startedAt = part.startedAt ?? event.timestamp;
  part.metadata = {
    ...part.metadata,
    stdout: nextStdout.value || undefined,
    stderr: nextStderr.value || undefined,
    outputTail:
      buildShellOutputTail(nextStdout.value, nextStderr.value) || undefined,
    truncated:
      part.metadata.truncated ||
      nextStdout.truncated ||
      nextStderr.truncated ||
      Boolean(event.payload.truncated),
  };
}

function updateToolPart(
  toolParts: Map<string, ToolActivityPart>,
  toolId: string,
  patch: Partial<ToolActivityPart>,
): void {
  const part = toolParts.get(toolId);
  if (!part) {
    return;
  }
  Object.assign(part, patch);
}

function createApprovalParts(
  run: Pick<SerializedRun, "id" | "sessionId" | "status" | "metadata"> | null,
  turnId: string | undefined,
): ApprovalActivityPart[] {
  const steps = run?.metadata.lifecycleSteps ?? [];
  return steps
    .filter((step) => step.step === "APPROVAL_WAIT")
    .map((step, index) => ({
      id: `${run?.id ?? "run"}:approval:${index}`,
      runId: run?.id ?? "",
      sessionId: run?.sessionId,
      turnId,
      kind: ACTIVITY_PART_KINDS.APPROVAL,
      createdAt: step.recordedAt,
      updatedAt: step.recordedAt,
      source: "brain",
      approvalType: inferApprovalType(step.detail),
      status: "requested",
      summary: inferApprovalSummary(step.detail),
      details: step.detail,
    }));
}

function createHandoffPart(
  run: Pick<SerializedRun, "id" | "sessionId" | "status" | "metadata"> | null,
  turnId: string | undefined,
): HandoffActivityPart | null {
  const handoff = run?.metadata.planArtifact?.handoff;
  if (!handoff) {
    return null;
  }
  const timestamp =
    run?.metadata.planArtifact?.createdAt ??
    run?.metadata.completedAt ??
    UNKNOWN_ACTIVITY_TIMESTAMP;

  return {
    id: `${run?.id ?? "run"}:handoff`,
    runId: run?.id ?? "",
    sessionId: run?.sessionId,
    turnId,
    kind: ACTIVITY_PART_KINDS.HANDOFF,
    createdAt: timestamp,
    updatedAt: timestamp,
    source: "brain",
    targetMode: handoff.targetMode,
    summary: handoff.summary,
    prompt: handoff.prompt,
    status: HANDOFF_ACTIVITY_STATUSES.READY,
  };
}

function buildToolMetadata(
  toolName: string,
  input: Record<string, unknown> | undefined,
  result: unknown,
  error: string | undefined,
): ToolActivityMetadata {
  const metadataFromResult = getStructuredActivityMetadata(result);
  if (metadataFromResult) {
    return metadataFromResult;
  }

  const outputText = getResultContent(result);
  switch (toolName) {
    case "read_file":
      return buildReadMetadata(input, outputText);
    case "list_files":
      return buildListMetadata(input, outputText);
    case "glob":
    case "grep":
      return buildSearchMetadata(toolName, input, outputText);
    case "bash":
      return {
        family: TOOL_ACTIVITY_FAMILIES.SHELL,
        command: readString(input?.command) ?? toolName,
        description: readString(input?.description),
        cwd: readString(input?.cwd) ?? ".",
        origin: "agent_tool",
        stdout: outputText || undefined,
        stderr: error,
        outputTail: buildShellOutputTail(outputText, error ?? "") || undefined,
        exitCode: error ? 1 : 0,
        truncated: false,
      };
    case "write_file":
      return {
        family: TOOL_ACTIVITY_FAMILIES.EDIT,
        filePath: readString(input?.path) ?? "unknown",
        additions: 0,
        deletions: 0,
        diffPreview: outputText || undefined,
      };
    case "git_status":
    case "git_diff":
      return {
        family: TOOL_ACTIVITY_FAMILIES.GIT,
        path: readString(input?.path),
        preview: outputText || undefined,
        count: countNonEmptyLines(outputText),
      };
    default:
      return {
        family: TOOL_ACTIVITY_FAMILIES.GENERIC,
        summary: outputText || error || undefined,
      };
  }
}

function mergeToolMetadata(
  current: ToolActivityMetadata,
  next: ToolActivityMetadata,
): ToolActivityMetadata {
  if (
    current.family !== TOOL_ACTIVITY_FAMILIES.SHELL ||
    next.family !== TOOL_ACTIVITY_FAMILIES.SHELL
  ) {
    return next;
  }

  const stdout = next.stdout ?? current.stdout;
  const stderr = next.stderr ?? current.stderr;
  return {
    ...current,
    ...next,
    stdout,
    stderr,
    outputTail: buildShellOutputTail(stdout ?? "", stderr ?? "") || undefined,
    truncated: current.truncated || next.truncated,
  };
}

function getStructuredActivityMetadata(
  result: unknown,
): ToolActivityMetadata | null {
  if (!isRecord(result)) {
    return null;
  }
  const metadata = isRecord(result.metadata) ? result.metadata : null;
  const activity =
    metadata && isRecord(metadata.activity) ? metadata.activity : null;
  const parsed = safeParseToolActivityMetadata(activity);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}

function getResultContent(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }
  if (isRecord(result) && typeof result.content === "string") {
    return result.content;
  }
  return "";
}

function buildReadMetadata(
  input: Record<string, unknown> | undefined,
  outputText: string,
): ToolActivityMetadata {
  const path = readString(input?.path);
  return {
    family: TOOL_ACTIVITY_FAMILIES.READ,
    path,
    count: path ? 1 : 0,
    truncated: outputText.length > 240,
    preview: truncateText(outputText, 240) || undefined,
    loadedPaths: path ? [path] : [],
  };
}

function buildListMetadata(
  input: Record<string, unknown> | undefined,
  outputText: string,
): ToolActivityMetadata {
  const path = readString(input?.path);
  const lines = splitNonEmptyLines(outputText);
  return {
    family: TOOL_ACTIVITY_FAMILIES.READ,
    path: path ?? ".",
    count: lines.length,
    truncated: /\.\.\. and \d+ more files/i.test(outputText),
    preview: truncateText(lines.slice(0, 6).join("\n"), 240) || undefined,
    loadedPaths: path ? [path] : [],
  };
}

function buildSearchMetadata(
  toolName: string,
  input: Record<string, unknown> | undefined,
  outputText: string,
): ToolActivityMetadata {
  const lines = splitNonEmptyLines(outputText);
  const loadedPaths =
    toolName === "grep"
      ? Array.from(
          new Set(
            lines
              .map((line) => line.split(":")[0]?.trim())
              .filter((line): line is string => Boolean(line)),
          ),
        )
      : lines;
  return {
    family: TOOL_ACTIVITY_FAMILIES.SEARCH,
    path: readString(input?.path) ?? ".",
    pattern: readString(input?.pattern),
    count: lines.length,
    truncated: false,
    preview: truncateText(lines.slice(0, 6).join("\n"), 240) || undefined,
    loadedPaths,
  };
}

function getReasoningLabel(step: string): string {
  switch (step) {
    case RUN_WORKFLOW_STEPS.PLANNING:
      return "Analyzing repository";
    case RUN_WORKFLOW_STEPS.EXECUTION:
      return "Executing tools";
    case RUN_WORKFLOW_STEPS.SYNTHESIS:
      return "Preparing final answer";
    default:
      return "Working";
  }
}

function getReasoningSummary(step: string): string {
  switch (step) {
    case RUN_WORKFLOW_STEPS.PLANNING:
      return "Preparing the operational plan.";
    case RUN_WORKFLOW_STEPS.EXECUTION:
      return "Running the selected coding tools.";
    case RUN_WORKFLOW_STEPS.SYNTHESIS:
      return "Summarizing execution results for the final response.";
    default:
      return "Updating run state.";
  }
}

function inferApprovalType(detail: string | undefined) {
  return detail?.toLowerCase().includes("workspace")
    ? "workspace_bootstrap"
    : "permission";
}

function inferApprovalSummary(detail: string | undefined): string {
  if (!detail?.trim()) {
    return "Approval required before continuing.";
  }
  const normalized = detail.trim();
  return normalized.endsWith(".") ? normalized : `${normalized}.`;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function splitNonEmptyLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function countNonEmptyLines(value: string): number {
  return splitNonEmptyLines(value).length;
}

function truncateText(value: string, maxLength: number): string {
  const compact = value.trim();
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength - 3)}...`;
}

function appendCappedText(
  current: string | undefined,
  delta: string | undefined,
  maxLength: number,
): { value: string; truncated: boolean } {
  const next = `${current ?? ""}${delta ?? ""}`;
  if (next.length <= maxLength) {
    return {
      value: next,
      truncated: false,
    };
  }
  return {
    value: next.slice(next.length - maxLength),
    truncated: true,
  };
}

function buildShellOutputTail(stdout: string, stderr: string): string {
  const sections: string[] = [];
  const trimmedStdout = stdout.trim();
  const trimmedStderr = stderr.trim();

  if (trimmedStdout) {
    sections.push(trimmedStdout);
  }
  if (trimmedStderr) {
    sections.push(`[stderr]\n${trimmedStderr}`);
  }

  const combined = sections.join("\n");
  if (combined.length <= SHELL_OUTPUT_TAIL_CAP) {
    return combined;
  }
  return combined.slice(combined.length - SHELL_OUTPUT_TAIL_CAP);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
