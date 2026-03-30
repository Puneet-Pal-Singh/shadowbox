import {
  RUN_EVENT_TYPES,
  RUN_WORKFLOW_STEPS,
  type RunEvent,
} from "@repo/shared-types";

export interface WorkflowRunSummary {
  runId: string;
  status: string | null;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  planArtifact?: {
    handoff: {
      targetMode: "build";
      prompt: string;
      summary: string;
    };
  } | null;
  eventCount?: number;
  lastEventType?: string | null;
}

export interface WorkflowTimelineSummary {
  elapsedLabel: string;
  totalToolCalls: number;
  failuresLabel: string;
  approvalsLabel?: string;
  agentLabel?: string;
}

export interface WorkflowToolRowViewModel {
  kind: "tool";
  key: string;
  toolId: string;
  toolName: string;
  title: string;
  summary: string;
  status: WorkflowTone;
  durationLabel: string | null;
  defaultCollapsed: boolean;
  details: string[];
}

export interface WorkflowDetailRowViewModel {
  kind: "detail";
  key: string;
  title: string;
  summary: string;
}

export type WorkflowRowViewModel =
  | WorkflowToolRowViewModel
  | WorkflowDetailRowViewModel;

export interface WorkflowBlockViewModel {
  key: string;
  kind: "plan" | "discovery" | "tool_batch" | "synthesis" | "final";
  title: string;
  summary: string;
  tone: WorkflowTone;
  durationLabel: string | null;
  eventCount: number;
  defaultCollapsed: boolean;
  rows: WorkflowRowViewModel[];
}

export interface WorkflowTimelineViewModel {
  summary: WorkflowTimelineSummary;
  blocks: WorkflowBlockViewModel[];
}

type WorkflowTone = "running" | "success" | "warning" | "failed" | "neutral";

interface MutableBlock {
  key: string;
  kind: WorkflowBlockViewModel["kind"];
  title: string;
  tone: WorkflowTone;
  startedAt: string | null;
  endedAt: string | null;
  eventCount: number;
  details: string[];
  rows: WorkflowRowViewModel[];
}

interface MutableToolRow {
  kind: "tool";
  key: string;
  toolId: string;
  toolName: string;
  title: string;
  status: WorkflowTone;
  durationMs: number | null;
  details: string[];
}

const AUTO_COMPACT_EVENT_THRESHOLD = 5;
const LOW_SIGNAL_RESULT_LENGTH = 120;
const READ_ONLY_TOOL_NAMES = new Set([
  "read_file",
  "list_files",
  "glob",
  "grep",
  "search_code",
  "git_diff",
]);

export function buildWorkflowTimelineViewModel(params: {
  events: RunEvent[];
  summary: WorkflowRunSummary | null;
}): WorkflowTimelineViewModel {
  const { events, summary } = params;
  const sortedEvents = [...events].sort((left, right) =>
    left.timestamp.localeCompare(right.timestamp),
  );
  const blocks: MutableBlock[] = [];
  const blockCounters = new Map<WorkflowBlockViewModel["kind"], number>();
  let currentContextBlock: MutableBlock | null = null;
  let currentToolBatch: MutableBlock | null = null;
  let currentToolRows = new Map<string, MutableToolRow>();

  for (const event of sortedEvents) {
    switch (event.type) {
      case RUN_EVENT_TYPES.RUN_STARTED:
        break;
      case RUN_EVENT_TYPES.RUN_STATUS_CHANGED: {
        const step = event.payload.workflowStep;
        if (step === RUN_WORKFLOW_STEPS.PLANNING) {
          currentToolBatch = null;
          currentToolRows = new Map<string, MutableToolRow>();
          const existingPlanBlock: MutableBlock | null = currentContextBlock;
          const planningBlock: MutableBlock =
            existingPlanBlock && existingPlanBlock.kind === "plan"
              ? existingPlanBlock
              : createAndPushBlock(
                  blocks,
                  blockCounters,
                  "plan",
                  "Planning next step",
                  event,
                );
          currentContextBlock = planningBlock;
          appendDetail(
            planningBlock,
            event.payload.reason
              ? toSentence(event.payload.reason)
              : "Preparing a safe execution plan for this request.",
          );
        } else if (step === RUN_WORKFLOW_STEPS.EXECUTION) {
          currentContextBlock = null;
          currentToolBatch =
            currentToolBatch ??
            createAndPushBlock(
              blocks,
              blockCounters,
              "tool_batch",
              "Preparing next action",
              event,
            );
          currentToolBatch.tone = "running";
          currentToolRows = new Map<string, MutableToolRow>();
        } else if (step === RUN_WORKFLOW_STEPS.SYNTHESIS) {
          finalizeToolBatch(currentToolBatch, currentToolRows);
          currentToolBatch = null;
          currentToolRows = new Map<string, MutableToolRow>();
          const existingSynthesisBlock: MutableBlock | null = currentContextBlock;
          const synthesisBlock: MutableBlock =
            existingSynthesisBlock && existingSynthesisBlock.kind === "synthesis"
              ? existingSynthesisBlock
              : createAndPushBlock(
                  blocks,
                  blockCounters,
                  "synthesis",
                  "Summarizing the change",
                  event,
                );
          currentContextBlock = synthesisBlock;
          synthesisBlock.tone = "running";
          appendDetail(
            synthesisBlock,
            "Preparing the final user-facing answer from the observed results.",
          );
        }
        break;
      }
      case RUN_EVENT_TYPES.RUN_PROGRESS: {
        const block = getOrCreateProgressBlock({
          event,
          currentContextBlock,
          currentToolBatch,
          blocks,
          blockCounters,
        });

        if (event.payload.phase === RUN_WORKFLOW_STEPS.EXECUTION) {
          currentToolBatch = block;
          currentContextBlock = null;
        } else {
          currentContextBlock = block;
        }

        block.title = event.payload.label;
        appendDetail(block, event.payload.summary);
        if (block.tone !== "failed") {
          block.tone =
            event.payload.status === "completed" ? "success" : "running";
        }
        break;
      }
      case RUN_EVENT_TYPES.MESSAGE_EMITTED: {
        if (event.payload.role === "user") {
          const block: MutableBlock =
            currentContextBlock ??
            createAndPushBlock(
              blocks,
              blockCounters,
              "discovery",
              "Reviewing request",
              event,
            );
          currentContextBlock = block;
          appendDetail(block, truncateText(event.payload.content, 180));
        } else if (event.payload.role === "assistant") {
          const block = getOrCreateAssistantBlock(
            currentContextBlock,
            blocks,
            blockCounters,
            event,
          );
          currentContextBlock = block;
          block.tone = block.kind === "final" ? block.tone : "success";
          appendDetail(block, truncateText(event.payload.content, 220));
        }
        break;
      }
      case RUN_EVENT_TYPES.TOOL_REQUESTED: {
        const block: MutableBlock =
          currentToolBatch ??
          createAndPushBlock(
            blocks,
            blockCounters,
            "tool_batch",
            "Preparing next action",
            event,
          );
        currentToolBatch = block;
        const row = getOrCreateToolRow(currentToolRows, event);
        row.status = "warning";
        row.details.push(
          summarizeArguments(event.payload.arguments) ??
            "Tool arguments captured.",
        );
        break;
      }
      case RUN_EVENT_TYPES.TOOL_STARTED: {
        const row = getOrCreateToolRow(currentToolRows, event);
        row.status = "running";
        break;
      }
      case RUN_EVENT_TYPES.TOOL_OUTPUT_APPENDED: {
        const row = getOrCreateToolRow(currentToolRows, event);
        row.status = "running";
        const outputDelta =
          event.payload.stdoutDelta ?? event.payload.stderrDelta ?? "";
        if (outputDelta) {
          row.details.push(truncateText(outputDelta, 220));
        }
        break;
      }
      case RUN_EVENT_TYPES.TOOL_COMPLETED: {
        const row = getOrCreateToolRow(currentToolRows, event);
        row.status = "success";
        row.durationMs = event.payload.executionTimeMs;
        row.details.push(summarizeToolResult(event.payload.result));
        if (currentToolBatch) {
          currentToolBatch.tone =
            currentToolBatch.tone === "failed" ? "failed" : "success";
          currentToolBatch.endedAt = event.timestamp;
        }
        break;
      }
      case RUN_EVENT_TYPES.TOOL_FAILED: {
        const row = getOrCreateToolRow(currentToolRows, event);
        row.status = "failed";
        row.durationMs = event.payload.executionTimeMs;
        row.details.push(truncateText(event.payload.error, 180));
        if (currentToolBatch) {
          currentToolBatch.tone = "failed";
          currentToolBatch.endedAt = event.timestamp;
        }
        break;
      }
      case RUN_EVENT_TYPES.RUN_COMPLETED: {
        finalizeToolBatch(currentToolBatch, currentToolRows);
        currentToolBatch = null;
        currentToolRows = new Map<string, MutableToolRow>();
        currentContextBlock = getOrCreateTerminalBlock(
          currentContextBlock,
          blocks,
          blockCounters,
          event,
        );
        currentContextBlock.tone = "success";
        appendDetail(
          currentContextBlock,
          `Run completed after ${formatDuration(event.payload.totalDurationMs)}.`,
        );
        currentContextBlock.endedAt = event.timestamp;
        break;
      }
      case RUN_EVENT_TYPES.RUN_FAILED: {
        finalizeToolBatch(currentToolBatch, currentToolRows);
        currentToolBatch = null;
        currentToolRows = new Map<string, MutableToolRow>();
        currentContextBlock = getOrCreateTerminalBlock(
          currentContextBlock,
          blocks,
          blockCounters,
          event,
        );
        currentContextBlock.tone = "failed";
        appendDetail(
          currentContextBlock,
          truncateText(event.payload.error, 180),
        );
        currentContextBlock.endedAt = event.timestamp;
        break;
      }
      default:
        break;
    }

    if (currentContextBlock) {
      currentContextBlock.eventCount += 1;
      currentContextBlock.endedAt = event.timestamp;
    } else if (currentToolBatch) {
      currentToolBatch.eventCount += 1;
      currentToolBatch.endedAt = event.timestamp;
    }
  }

  finalizeToolBatch(currentToolBatch, currentToolRows);

  return {
    summary: buildSummary(sortedEvents, summary),
    blocks: blocks.map(finalizeBlock),
  };
}

function createAndPushBlock(
  blocks: MutableBlock[],
  counters: Map<WorkflowBlockViewModel["kind"], number>,
  kind: WorkflowBlockViewModel["kind"],
  title: string,
  event: RunEvent,
): MutableBlock {
  const block = createBlock(kind, title, event, counters);
  blocks.push(block);
  return block;
}

function createBlock(
  kind: WorkflowBlockViewModel["kind"],
  title: string,
  event: RunEvent,
  counters: Map<WorkflowBlockViewModel["kind"], number>,
): MutableBlock {
  const nextIndex = (counters.get(kind) ?? 0) + 1;
  counters.set(kind, nextIndex);
  return {
    key: `${kind}-${nextIndex}-${event.eventId}`,
    kind,
    title,
    tone: kind === "final" ? "neutral" : "running",
    startedAt: event.timestamp,
    endedAt: event.timestamp,
    eventCount: 0,
    details: [],
    rows: [],
  };
}

function getOrCreateAssistantBlock(
  currentContextBlock: MutableBlock | null,
  blocks: MutableBlock[],
  counters: Map<WorkflowBlockViewModel["kind"], number>,
  event: RunEvent,
): MutableBlock {
  if (currentContextBlock?.kind === "synthesis") {
    return currentContextBlock;
  }

  const lastBlock = blocks[blocks.length - 1];
  if (lastBlock?.kind === "final") {
    return lastBlock;
  }

  return createAndPushBlock(blocks, counters, "final", "Final answer", event);
}

function getOrCreateTerminalBlock(
  currentContextBlock: MutableBlock | null,
  blocks: MutableBlock[],
  counters: Map<WorkflowBlockViewModel["kind"], number>,
  event: Extract<
    RunEvent,
    | { type: typeof RUN_EVENT_TYPES.RUN_COMPLETED }
    | { type: typeof RUN_EVENT_TYPES.RUN_FAILED }
  >,
): MutableBlock {
  if (currentContextBlock?.kind === "final") {
    return currentContextBlock;
  }

  const lastBlock = blocks[blocks.length - 1];
  if (lastBlock?.kind === "final") {
    return lastBlock;
  }

  return createAndPushBlock(blocks, counters, "final", "Final answer", event);
}

function getOrCreateProgressBlock(params: {
  event: Extract<RunEvent, { type: typeof RUN_EVENT_TYPES.RUN_PROGRESS }>;
  currentContextBlock: MutableBlock | null;
  currentToolBatch: MutableBlock | null;
  blocks: MutableBlock[];
  blockCounters: Map<WorkflowBlockViewModel["kind"], number>;
}): MutableBlock {
  const { event, currentContextBlock, currentToolBatch, blocks, blockCounters } =
    params;

  if (event.payload.phase === RUN_WORKFLOW_STEPS.EXECUTION) {
    return (
      currentToolBatch ??
      createAndPushBlock(
        blocks,
        blockCounters,
        "tool_batch",
        event.payload.label,
        event,
      )
    );
  }

  const expectedKind =
    event.payload.phase === RUN_WORKFLOW_STEPS.PLANNING ? "plan" : "synthesis";
  if (currentContextBlock?.kind === expectedKind) {
    return currentContextBlock;
  }

  return createAndPushBlock(
    blocks,
    blockCounters,
    expectedKind,
    event.payload.label,
    event,
  );
}

function appendDetail(block: MutableBlock, detail: string): void {
  if (!detail.trim()) {
    return;
  }
  if (block.details[block.details.length - 1] === detail) {
    return;
  }
  block.details.push(detail);
}

function getOrCreateToolRow(
  rows: Map<string, MutableToolRow>,
  event:
    | Extract<RunEvent, { type: typeof RUN_EVENT_TYPES.TOOL_REQUESTED }>
    | Extract<RunEvent, { type: typeof RUN_EVENT_TYPES.TOOL_STARTED }>
    | Extract<RunEvent, { type: typeof RUN_EVENT_TYPES.TOOL_OUTPUT_APPENDED }>
    | Extract<RunEvent, { type: typeof RUN_EVENT_TYPES.TOOL_COMPLETED }>
    | Extract<RunEvent, { type: typeof RUN_EVENT_TYPES.TOOL_FAILED }>,
): MutableToolRow {
  const payload = event.payload;
  const existing = rows.get(payload.toolId);
  if (existing) {
    return existing;
  }
  const title =
    event.type === RUN_EVENT_TYPES.TOOL_REQUESTED
      ? getToolRowTitle(event.payload)
      : humanizeToolName(payload.toolName);

  const created: MutableToolRow = {
    kind: "tool",
    key: `${payload.toolName}-${payload.toolId}`,
    toolId: payload.toolId,
    toolName: payload.toolName,
    title,
    status: "warning",
    durationMs: null,
    details: [],
  };
  rows.set(payload.toolId, created);
  return created;
}

function finalizeToolBatch(
  block: MutableBlock | null,
  rows: Map<string, MutableToolRow>,
): void {
  if (!block) {
    return;
  }

  block.rows = Array.from(rows.values()).map((row) => {
    const summary =
      row.status === "failed"
        ? "Failed"
        : row.status === "success"
          ? "Completed"
          : row.status === "running"
            ? "Running"
            : "Queued";
    return {
      kind: "tool",
      key: row.key,
      toolId: row.toolId,
      toolName: row.toolName,
      title: row.title,
      summary,
      status: row.status,
      durationLabel:
        row.durationMs !== null ? formatDuration(row.durationMs) : null,
      defaultCollapsed: isLowSignalToolRow(row),
      details: row.details.filter(Boolean),
    } satisfies WorkflowToolRowViewModel;
  });

  if (block.rows.length === 0) {
    appendDetail(block, "Execution started.");
  }
}

function finalizeBlock(block: MutableBlock): WorkflowBlockViewModel {
  const detailRows: WorkflowDetailRowViewModel[] = block.details.map(
    (detail, index) => ({
      kind: "detail",
      key: `${block.key}-detail-${index}`,
      title: index === 0 ? block.title : "Detail",
      summary: detail,
    }),
  );
  const rows = block.kind === "tool_batch" ? block.rows : detailRows;
  const summary = buildBlockSummary(block, rows);

  return {
    key: block.key,
    kind: block.kind,
    title: block.title,
    summary,
    tone: block.tone,
    durationLabel: formatRangeDuration(block.startedAt, block.endedAt),
    eventCount: block.eventCount,
    defaultCollapsed: shouldAutoCollapseBlock(block, rows),
    rows,
  };
}

function buildBlockSummary(
  block: MutableBlock,
  rows: WorkflowRowViewModel[],
): string {
  if (block.kind === "tool_batch") {
    const queuedCount = rows.filter(
      (row) => row.kind === "tool" && row.status === "warning",
    ).length;
    const completedCount = rows.filter(
      (row) => row.kind === "tool" && row.status === "success",
    ).length;
    const failedCount = rows.filter(
      (row) => row.kind === "tool" && row.status === "failed",
    ).length;
    const runningCount = rows.filter(
      (row) => row.kind === "tool" && row.status === "running",
    ).length;
    if (failedCount > 0) {
      return `${failedCount} failed, ${completedCount} completed`;
    }
    if (runningCount > 0) {
      return `${runningCount} running, ${completedCount} completed`;
    }
    if (queuedCount > 0) {
      return completedCount > 0
        ? `${queuedCount} queued, ${completedCount} completed`
        : `${queuedCount} queued`;
    }
    if (rows.length === 0) {
      return block.details[0] ?? "Waiting for first tool call";
    }
    return `${rows.length} tool call${rows.length === 1 ? "" : "s"} completed`;
  }

  return block.details[0] ?? "No details yet.";
}

function shouldAutoCollapseBlock(
  block: MutableBlock,
  rows: WorkflowRowViewModel[],
): boolean {
  if (block.tone === "failed") {
    return false;
  }
  if (block.kind === "final") {
    return block.tone === "success";
  }
  if (block.kind === "tool_batch") {
    return (
      block.eventCount >= AUTO_COMPACT_EVENT_THRESHOLD &&
      rows.every(
        (row) =>
          row.kind !== "tool" ||
          row.defaultCollapsed ||
          row.status !== "failed",
      )
    );
  }
  return block.eventCount >= AUTO_COMPACT_EVENT_THRESHOLD;
}

function isLowSignalToolRow(row: MutableToolRow): boolean {
  if (row.status !== "success") {
    return false;
  }
  const detailSize = row.details.join(" ").length;
  return (
    READ_ONLY_TOOL_NAMES.has(row.toolName) &&
    detailSize <= LOW_SIGNAL_RESULT_LENGTH
  );
}

function buildSummary(
  events: RunEvent[],
  summary: WorkflowRunSummary | null,
): WorkflowTimelineSummary {
  const toolIds = new Set<string>();
  let toolFailures = 0;
  let terminalDurationMs: number | null = null;

  for (const event of events) {
    if (
      event.type === RUN_EVENT_TYPES.TOOL_REQUESTED ||
      event.type === RUN_EVENT_TYPES.TOOL_STARTED ||
      event.type === RUN_EVENT_TYPES.TOOL_OUTPUT_APPENDED ||
      event.type === RUN_EVENT_TYPES.TOOL_COMPLETED ||
      event.type === RUN_EVENT_TYPES.TOOL_FAILED
    ) {
      toolIds.add(event.payload.toolId);
    }
    if (event.type === RUN_EVENT_TYPES.TOOL_FAILED) {
      toolFailures += 1;
    }
    if (
      event.type === RUN_EVENT_TYPES.RUN_COMPLETED ||
      event.type === RUN_EVENT_TYPES.RUN_FAILED
    ) {
      terminalDurationMs = event.payload.totalDurationMs;
    }
  }

  const elapsedMs =
    terminalDurationMs ??
    deriveElapsedMs(
      events[0]?.timestamp ?? null,
      events[events.length - 1]?.timestamp ?? null,
    );

  const failedTaskCount = summary?.failedTasks ?? toolFailures;

  return {
    elapsedLabel:
      elapsedMs > 0
        ? `Worked for ${formatDuration(elapsedMs)}`
        : "Started just now",
    totalToolCalls: toolIds.size,
    failuresLabel:
      failedTaskCount > 0
        ? `${failedTaskCount} failure${failedTaskCount === 1 ? "" : "s"}`
        : "No failures",
  };
}

function deriveElapsedMs(
  startedAt: string | null,
  endedAt: string | null,
): number {
  if (!startedAt || !endedAt) {
    return 0;
  }
  const startMs = Date.parse(startedAt);
  const endMs = Date.parse(endedAt);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return 0;
  }
  return Math.max(0, endMs - startMs);
}

function formatRangeDuration(
  startedAt: string | null,
  endedAt: string | null,
): string | null {
  const elapsedMs = deriveElapsedMs(startedAt, endedAt);
  return elapsedMs > 0 ? formatDuration(elapsedMs) : null;
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) {
    return `${durationMs}ms`;
  }
  const totalSeconds = Math.round(durationMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

function summarizeArguments(
  arguments_: Record<string, unknown>,
): string | null {
  const entries = Object.entries(arguments_);
  if (entries.length === 0) {
    return null;
  }
  return truncateText(
    entries
      .slice(0, 3)
      .map(([key, value]) => `${key}=${summarizeUnknown(value)}`)
      .join(" · "),
    140,
  );
}

function summarizeToolResult(result: unknown): string {
  const rendered = summarizeUnknown(result);
  if (!rendered.trim()) {
    return "Completed successfully.";
  }
  return truncateText(rendered, 180);
}

function summarizeUnknown(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function humanizeToolName(toolName: string): string {
  return toolName
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function getToolRowTitle(
  payload: Extract<
    RunEvent,
    { type: typeof RUN_EVENT_TYPES.TOOL_REQUESTED }
  >["payload"],
): string {
  if (payload.displayText) {
    return payload.displayText;
  }

  if (payload.description) {
    return payload.description;
  }

  const path =
    typeof payload.arguments.path === "string" ? payload.arguments.path : undefined;
  const pattern =
    typeof payload.arguments.pattern === "string"
      ? payload.arguments.pattern
      : undefined;
  const command =
    typeof payload.arguments.command === "string"
      ? payload.arguments.command
      : undefined;

  switch (payload.toolName) {
    case "read_file":
      return path ? `Reading ${path}` : "Reading file";
    case "list_files":
      return path && path !== "." ? `Listing ${path}` : "Listing project files";
    case "glob":
      return pattern ? `Finding ${pattern}` : "Finding files";
    case "grep":
      return pattern ? `Searching for ${pattern}` : "Searching project";
    case "write_file":
      return path ? `Editing ${path}` : "Editing file";
    case "bash":
    case "shell_exec":
      return command ? `Running ${command}` : "Running command";
    case "git_status":
      return "Checking git status";
    case "git_diff":
      return path ? `Checking git diff for ${path}` : "Checking git diff";
    default:
      return humanizeToolName(payload.toolName);
  }
}

function truncateText(text: string, maxLength: number): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength)}...`;
}

function toSentence(reason: string): string {
  const trimmed = reason.trim();
  if (!trimmed) {
    return "";
  }
  const normalized = trimmed.slice(0, 1).toUpperCase() + trimmed.slice(1);
  return normalized.endsWith(".") ? normalized : `${normalized}.`;
}
