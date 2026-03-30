import {
  ACTIVITY_PART_KINDS,
  TOOL_ACTIVITY_FAMILIES,
  type ActivityFeedSnapshot,
  type ActivityPart,
  type ToolActivityPart,
} from "@repo/shared-types";
import {
  getGitCommandLabel,
  getGitDetails,
  getGitSummary,
} from "./gitTranscript.js";

export interface ActivityFeedSummaryViewModel {
  elapsedLabel: string;
  toolCallsLabel: string;
  approvalsLabel: string | null;
  handoffLabel: string | null;
}

export interface ActivityTextRowViewModel {
  kind: "text";
  key: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: Record<string, unknown>;
}

export interface ActivityReasoningRowViewModel {
  kind: "reasoning";
  key: string;
  label: string;
  summary: string;
  status: "active" | "completed";
}

export interface ActivityApprovalRowViewModel {
  kind: "approval";
  key: string;
  approvalType: "permission" | "workspace_bootstrap";
  status: "requested" | "granted" | "denied" | "expired";
  summary: string;
  details?: string;
}

export interface ActivityHandoffRowViewModel {
  kind: "handoff";
  key: string;
  summary: string;
  prompt: string;
  status: "ready" | "accepted" | "dismissed";
}

export interface ActivityToolRowViewModel {
  kind: "tool";
  key: string;
  toolName: string;
  family: ToolActivityPart["metadata"]["family"];
  title: string;
  summary: string;
  status: "requested" | "running" | "completed" | "failed";
  defaultCollapsed: boolean;
  details: string[];
}

export interface ActivityGroupRowViewModel {
  kind: "group";
  key: string;
  title: string;
  summary: string;
  status: "requested" | "running" | "completed" | "failed";
  defaultCollapsed: boolean;
  rows: ActivityToolRowViewModel[];
}

export type ActivityFeedRowViewModel =
  | ActivityTextRowViewModel
  | ActivityReasoningRowViewModel
  | ActivityApprovalRowViewModel
  | ActivityHandoffRowViewModel
  | ActivityToolRowViewModel
  | ActivityGroupRowViewModel;

export interface ActivityTurnViewModel {
  key: string;
  userPrompt: string | null;
  elapsedLabel: string;
  summaryLabel: string;
  defaultCollapsed: boolean;
  isActiveTurn: boolean;
  hasVisibleRows: boolean;
  rows: ActivityFeedRowViewModel[];
}

export interface ActivityFeedViewModel {
  summary: ActivityFeedSummaryViewModel;
  turns: ActivityTurnViewModel[];
}

const LOW_SIGNAL_EXPLORATION_THRESHOLD = 2;

export function buildActivityFeedViewModel(
  feed: ActivityFeedSnapshot | null,
): ActivityFeedViewModel {
  if (!feed) {
    return {
      summary: {
        elapsedLabel: "Waiting for activity",
        toolCallsLabel: "0 tool calls",
        approvalsLabel: null,
        handoffLabel: null,
      },
      turns: [],
    };
  }

  const turnGroups = groupItemsIntoTurns(feed.items);
  const lastTurnIndex = turnGroups.length - 1;
  return {
    summary: buildFeedSummary(feed),
    turns: turnGroups.flatMap((turn, index) => {
      const turnKey = resolveActivityTurnKey(turn.turnId, index);
      if (!turnKey) {
        return [];
      }

      const rows = buildTurnRows(turn.items);
      const isActiveTurn = feed.status === "RUNNING" && index === lastTurnIndex;
      return [
        {
          key: turnKey,
          userPrompt: getTurnUserPrompt(turn.items),
          elapsedLabel: formatDuration(
            turn.items[0]?.createdAt ?? null,
            turn.items[turn.items.length - 1]?.updatedAt ?? null,
            isActiveTurn,
          ),
          summaryLabel: buildTurnSummary(rows),
          defaultCollapsed: !isActiveTurn,
          isActiveTurn,
          hasVisibleRows: rows.length > 0,
          rows,
        },
      ];
    }),
  };
}

function resolveActivityTurnKey(
  turnId: string | undefined,
  index: number,
): string | null {
  if (!turnId) {
    console.warn(
      "[activity/feed] Skipping activity turn without canonical turnId.",
      { index },
    );
    return null;
  }

  return turnId;
}

function groupItemsIntoTurns(
  items: ActivityPart[],
): Array<{ turnId?: string; items: ActivityPart[] }> {
  const grouped: Array<{ turnId?: string; items: ActivityPart[] }> = [];
  for (const item of items) {
    const last = grouped[grouped.length - 1];
    if (!last || last.turnId !== item.turnId) {
      grouped.push({ turnId: item.turnId, items: [item] });
      continue;
    }
    last.items.push(item);
  }
  return grouped;
}

function buildTurnRows(items: ActivityPart[]): ActivityFeedRowViewModel[] {
  const rows: ActivityFeedRowViewModel[] = [];
  let pendingExplore: ActivityToolRowViewModel[] = [];

  for (const item of items) {
    if (item.kind === ACTIVITY_PART_KINDS.TEXT) {
      if (shouldDisplayTextRow(item)) {
        flushExploreGroup(rows, pendingExplore);
        pendingExplore = [];
        rows.push(createNonToolRow(item));
      }
      continue;
    }

    if (
      item.kind === ACTIVITY_PART_KINDS.REASONING &&
      isSuppressedReasoning(item)
    ) {
      continue;
    }

    if (item.kind === ACTIVITY_PART_KINDS.TOOL) {
      const row = createToolRow(item);
      if (isExplorationTool(row)) {
        pendingExplore.push(row);
        continue;
      }
      flushExploreGroup(rows, pendingExplore);
      pendingExplore = [];
      rows.push(row);
      continue;
    }

    flushExploreGroup(rows, pendingExplore);
    pendingExplore = [];
    rows.push(createNonToolRow(item));
  }

  flushExploreGroup(rows, pendingExplore);
  return rows;
}

function getTurnUserPrompt(items: ActivityPart[]): string | null {
  for (const item of items) {
    if (item.kind === ACTIVITY_PART_KINDS.TEXT && item.role === "user") {
      const content = item.content.trim();
      return content || null;
    }
  }

  return null;
}

function buildTurnSummary(rows: ActivityFeedRowViewModel[]): string {
  const toolCount = rows.reduce((count, row) => {
    if (row.kind === "tool") {
      return count + 1;
    }
    if (row.kind === "group") {
      return count + row.rows.length;
    }
    return count;
  }, 0);
  const reasoningCount = rows.filter((row) => row.kind === "reasoning").length;
  const approvalCount = rows.filter((row) => row.kind === "approval").length;
  const handoffCount = rows.filter((row) => row.kind === "handoff").length;
  const failureCount = rows.reduce((count, row) => {
    if (row.kind === "tool") {
      return count + (row.status === "failed" ? 1 : 0);
    }
    if (row.kind === "group") {
      return (
        count +
        row.rows.filter((groupRow) => groupRow.status === "failed").length
      );
    }
    return count;
  }, 0);

  const parts: string[] = [];
  if (toolCount > 0) {
    parts.push(`${toolCount} tool call${toolCount === 1 ? "" : "s"}`);
  }
  if (reasoningCount > 0) {
    parts.push(
      `${reasoningCount} thinking step${reasoningCount === 1 ? "" : "s"}`,
    );
  }
  if (approvalCount > 0) {
    parts.push(`${approvalCount} approval${approvalCount === 1 ? "" : "s"}`);
  }
  if (handoffCount > 0) {
    parts.push(`${handoffCount} handoff${handoffCount === 1 ? "" : "s"}`);
  }
  if (failureCount > 0) {
    parts.push(`${failureCount} failure${failureCount === 1 ? "" : "s"}`);
  }

  return parts[0] ? parts.slice(0, 3).join(" · ") : "Workflow captured";
}

function createNonToolRow(item: Exclude<ActivityPart, ToolActivityPart>) {
  switch (item.kind) {
    case ACTIVITY_PART_KINDS.TEXT:
      return {
        kind: "text",
        key: item.id,
        role: item.role,
        content: item.content,
        metadata: item.metadata,
      } satisfies ActivityTextRowViewModel;
    case ACTIVITY_PART_KINDS.REASONING:
      return {
        kind: "reasoning",
        key: item.id,
        label: "Thinking",
        summary: normalizeReasoningSummary(item.summary),
        status: item.status,
      } satisfies ActivityReasoningRowViewModel;
    case ACTIVITY_PART_KINDS.APPROVAL:
      return {
        kind: "approval",
        key: item.id,
        approvalType: item.approvalType,
        status: item.status,
        summary: item.summary,
        details: item.details,
      } satisfies ActivityApprovalRowViewModel;
    case ACTIVITY_PART_KINDS.HANDOFF:
      return {
        kind: "handoff",
        key: item.id,
        summary: item.summary,
        prompt: item.prompt,
        status: item.status,
      } satisfies ActivityHandoffRowViewModel;
  }
}

function isSuppressedReasoning(
  item: Extract<ActivityPart, { kind: typeof ACTIVITY_PART_KINDS.REASONING }>,
): boolean {
  return normalizeReasoningSummary(item.summary) === "";
}

function normalizeReasoningSummary(summary: string): string {
  const trimmed = summary.trim();
  if (!trimmed) {
    return "";
  }

  if (
    trimmed === "Preparing the operational plan." ||
    trimmed === "Running the selected coding tools." ||
    trimmed === "Summarizing execution results for the final response."
  ) {
    return "";
  }

  return trimmed;
}

function shouldDisplayTextRow(
  item: Extract<ActivityPart, { kind: typeof ACTIVITY_PART_KINDS.TEXT }>,
): boolean {
  if (item.role === "user") {
    return false;
  }

  // The activity transcript only promotes terminal recovery/incomplete messages.
  // Normal assistant replies stay in the main chat transcript instead of duplicating here.
  const code =
    typeof item.metadata?.code === "string" ? item.metadata.code : undefined;
  return code === "INCOMPLETE_MUTATION" || code === "TASK_EXECUTION_TIMEOUT";
}

function createToolRow(item: ToolActivityPart): ActivityToolRowViewModel {
  return {
    kind: "tool",
    key: item.id,
    toolName: item.toolName,
    family: item.metadata.family,
    title: getToolTitle(item),
    summary: getToolSummary(item),
    status: item.status,
    defaultCollapsed:
      item.metadata.family !== TOOL_ACTIVITY_FAMILIES.SHELL &&
      item.metadata.family !== TOOL_ACTIVITY_FAMILIES.GIT &&
      item.metadata.family !== TOOL_ACTIVITY_FAMILIES.EDIT &&
      item.status === "completed",
    details: getToolDetails(item),
  };
}

function isExplorationTool(row: ActivityToolRowViewModel): boolean {
  return (
    (row.family === TOOL_ACTIVITY_FAMILIES.READ ||
      row.family === TOOL_ACTIVITY_FAMILIES.SEARCH) &&
    row.status !== "failed"
  );
}

function flushExploreGroup(
  rows: ActivityFeedRowViewModel[],
  exploreRows: ActivityToolRowViewModel[],
): void {
  if (exploreRows.length === 0) {
    return;
  }
  if (exploreRows.length < LOW_SIGNAL_EXPLORATION_THRESHOLD) {
    rows.push(...exploreRows);
    return;
  }
  const hasFailedRows = exploreRows.some((row) => row.status === "failed");
  const hasRunningRows = exploreRows.some(
    (row) => row.status === "requested" || row.status === "running",
  );
  rows.push({
    kind: "group",
    key: `explore-${exploreRows[0]?.key ?? "group"}`,
    title: hasRunningRows ? "Gathering context" : "Gathered context",
    summary: hasRunningRows
      ? `${exploreRows.length} read/search actions in progress`
      : `${exploreRows.length} low-noise context actions`,
    status: hasFailedRows ? "failed" : hasRunningRows ? "running" : "completed",
    defaultCollapsed: !hasRunningRows,
    rows: [...exploreRows],
  });
}

function getToolTitle(item: ToolActivityPart): string {
  switch (item.metadata.family) {
    case TOOL_ACTIVITY_FAMILIES.SHELL:
      return item.metadata.command;
    case TOOL_ACTIVITY_FAMILIES.EDIT:
      return `Edit ${item.metadata.filePath}`;
    case TOOL_ACTIVITY_FAMILIES.READ:
      return item.metadata.path
        ? `Read ${item.metadata.path}`
        : humanizeToolName(item.toolName);
    case TOOL_ACTIVITY_FAMILIES.SEARCH:
      return item.metadata.pattern
        ? `Search ${item.metadata.pattern}`
        : humanizeToolName(item.toolName);
    case TOOL_ACTIVITY_FAMILIES.GIT:
      return getGitCommandLabel(item);
    default:
      return humanizeToolName(item.toolName);
  }
}

function getToolSummary(item: ToolActivityPart): string {
  switch (item.metadata.family) {
    case TOOL_ACTIVITY_FAMILIES.SHELL:
      return item.status === "failed"
        ? "Command failed"
        : item.status === "running"
          ? "Running"
          : item.status === "requested"
            ? "Queued"
          : "";
    case TOOL_ACTIVITY_FAMILIES.EDIT:
      return `+${item.metadata.additions} / -${item.metadata.deletions}`;
    case TOOL_ACTIVITY_FAMILIES.READ:
    case TOOL_ACTIVITY_FAMILIES.SEARCH:
      return "";
    case TOOL_ACTIVITY_FAMILIES.GIT:
      return getGitSummary(item);
    default:
      return humanizeToolStatus(item.status);
  }
}

function getToolDetails(item: ToolActivityPart): string[] {
  switch (item.metadata.family) {
    case TOOL_ACTIVITY_FAMILIES.SHELL:
      return [
        item.metadata.cwd ? `cwd: ${item.metadata.cwd}` : "",
        item.metadata.outputTail ?? "",
        item.metadata.truncated ? "Output truncated to the latest shell tail." : "",
      ].filter(Boolean);
    case TOOL_ACTIVITY_FAMILIES.EDIT:
      return [item.metadata.diffPreview ?? ""].filter(Boolean);
    case TOOL_ACTIVITY_FAMILIES.READ:
    case TOOL_ACTIVITY_FAMILIES.SEARCH:
      return [item.metadata.preview ?? ""].filter(Boolean);
    case TOOL_ACTIVITY_FAMILIES.GIT:
      return getGitDetails(item);
    default:
      return [];
  }
}

function buildFeedSummary(
  feed: ActivityFeedSnapshot,
): ActivityFeedSummaryViewModel {
  const toolCount = feed.items.filter(
    (item) => item.kind === ACTIVITY_PART_KINDS.TOOL,
  ).length;
  const approvalCount = feed.items.filter(
    (item) => item.kind === ACTIVITY_PART_KINDS.APPROVAL,
  ).length;
  const handoffCount = feed.items.filter(
    (item) => item.kind === ACTIVITY_PART_KINDS.HANDOFF,
  ).length;
  const startedAt = feed.items[0]?.createdAt ?? null;
  const endedAt = feed.items[feed.items.length - 1]?.updatedAt ?? null;
  const elapsed = formatDuration(startedAt, endedAt);

  return {
    elapsedLabel: elapsed,
    toolCallsLabel: `${toolCount} tool call${toolCount === 1 ? "" : "s"}`,
    approvalsLabel:
      approvalCount > 0
        ? `${approvalCount} approval${approvalCount === 1 ? "" : "s"}`
        : null,
    handoffLabel:
      handoffCount > 0
        ? `${handoffCount} handoff${handoffCount === 1 ? "" : "s"}`
        : null,
  };
}

function formatDuration(
  startedAt: string | null,
  endedAt: string | null,
  isActive: boolean = false,
): string {
  if (!startedAt || !endedAt) {
    return isActive ? "Working now" : "Started just now";
  }
  const elapsedMs = Math.max(0, Date.parse(endedAt) - Date.parse(startedAt));
  if (elapsedMs < 1_000) {
    return isActive ? "Working now" : "Started just now";
  }
  const totalSeconds = Math.round(elapsedMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) {
    return `${isActive ? "Working" : "Worked"} for ${seconds}s`;
  }
  return `${isActive ? "Working" : "Worked"} for ${minutes}m ${seconds}s`;
}

function humanizeToolName(toolName: string): string {
  return toolName
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function humanizeToolStatus(
  status: ActivityToolRowViewModel["status"],
): string {
  switch (status) {
    case "requested":
      return "Queued";
    case "running":
      return "Running";
    case "failed":
      return "Failed";
    default:
      return "Completed";
  }
}
