import { ChevronDown, ChevronRight } from "lucide-react";
import type { WorkflowToolRowViewModel } from "../../../services/workflow/WorkflowTimelineViewModel.js";
import { cn } from "../../../lib/utils.js";

interface ToolCallRowProps {
  row: WorkflowToolRowViewModel;
  expanded: boolean;
  onToggle: () => void;
}

export function ToolCallRow({ row, expanded, onToggle }: ToolCallRowProps) {
  const isShellStyledRow = row.toolName === "shell_exec" || row.toolName === "bash";
  const isExpandable = isShellStyledRow && row.details.length > 0;

  if (!isExpandable) {
    return (
      <div className="space-y-1 py-1">
        <div
          className={cn(
            "text-sm font-medium",
            row.status === "failed" ? "text-red-300" : "text-zinc-500",
          )}
        >
          {row.title}
        </div>
        {shouldRenderCompactSummary(row) ? (
          <div
            className={cn(
              "text-sm",
              row.status === "failed" ? "text-red-400/80" : "text-zinc-500",
            )}
          >
            {row.summary}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-start gap-2 text-left"
      >
        <span className="mt-0.5 text-zinc-500">
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-zinc-400">
              {getShellRowHeading(row)}
            </span>
            {row.durationLabel ? (
              <span className="text-xs text-zinc-500">{row.durationLabel}</span>
            ) : null}
          </div>
        </div>
      </button>
      {expanded && row.details.length > 0 ? (
        <div
          className={cn(
            "rounded-2xl border px-4 py-3",
            getShellCardClass(row.status),
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-zinc-100">Shell</div>
            <div className={getShellStatusTextClass(row.status)}>
              {getShellStatusText(row.status)}
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {row.details.map((detail, index) => (
              <pre
                key={`${row.key}-${index}`}
                className="overflow-x-auto whitespace-pre-wrap break-words bg-transparent text-xs leading-6 text-zinc-100"
              >
                {detail}
              </pre>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function shouldRenderCompactSummary(row: WorkflowToolRowViewModel): boolean {
  return row.status === "failed";
}

function getShellRowHeading(row: WorkflowToolRowViewModel): string {
  const command = extractShellCommand(row.details[0] ?? "");
  const prefix =
    row.status === "warning" || row.status === "running" ? "Running" : "Ran";

  return command ? `${prefix} ${command}` : `${prefix} command`;
}

function extractShellCommand(detail: string): string {
  const firstLine = detail.split("\n")[0]?.trim() ?? "";
  return firstLine.startsWith("$ ") ? firstLine.slice(2).trim() : "";
}

function getShellCardClass(status: WorkflowToolRowViewModel["status"]): string {
  switch (status) {
    case "failed":
      return "border-red-900/60 bg-zinc-800/75";
    case "running":
    case "warning":
      return "border-zinc-700/60 bg-zinc-800/75";
    default:
      return "border-zinc-700/60 bg-zinc-800/75";
  }
}

function getShellStatusText(
  status: WorkflowToolRowViewModel["status"],
): string {
  switch (status) {
    case "failed":
      return "Failed";
    case "running":
    case "warning":
      return "Running";
    default:
      return "Success";
  }
}

function getShellStatusTextClass(
  status: WorkflowToolRowViewModel["status"],
): string {
  switch (status) {
    case "failed":
      return "text-sm font-medium text-red-200";
    case "running":
    case "warning":
      return "text-sm font-medium text-amber-200";
    default:
      return "text-sm font-medium text-zinc-200";
  }
}
