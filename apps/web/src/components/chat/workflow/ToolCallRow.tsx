import { ChevronDown, ChevronRight } from "lucide-react";
import type { WorkflowToolRowViewModel } from "../../../services/workflow/WorkflowTimelineViewModel.js";
import { cn } from "../../../lib/utils.js";

interface ToolCallRowProps {
  row: WorkflowToolRowViewModel;
  expanded: boolean;
  onToggle: () => void;
}

export function ToolCallRow({ row, expanded, onToggle }: ToolCallRowProps) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-black/40",
        getRowBorderClass(row.status),
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-start gap-3 px-3 py-3 text-left"
      >
        <span className="mt-0.5 text-zinc-500">
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-zinc-100">
              {row.title}
            </span>
            <StatusBadge status={row.status} />
            {row.durationLabel ? (
              <span className="text-xs text-zinc-500">{row.durationLabel}</span>
            ) : null}
          </div>
          <div className="mt-1 text-sm text-zinc-400">{row.summary}</div>
        </div>
      </button>
      {expanded && row.details.length > 0 ? (
        <div className="border-t border-zinc-800/80 px-4 py-3 text-xs text-zinc-300">
          <ul className="space-y-2">
            {row.details.map((detail, index) => (
              <li key={`${row.key}-${index}`} className="break-words">
                {detail}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: WorkflowToolRowViewModel["status"];
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]",
        getStatusBadgeClass(status),
      )}
    >
      {status}
    </span>
  );
}

function getRowBorderClass(status: WorkflowToolRowViewModel["status"]): string {
  switch (status) {
    case "failed":
      return "border-red-900/70";
    case "success":
      return "border-emerald-900/60";
    case "running":
      return "border-amber-900/70";
    default:
      return "border-zinc-800/80";
  }
}

function getStatusBadgeClass(
  status: WorkflowToolRowViewModel["status"],
): string {
  switch (status) {
    case "failed":
      return "bg-red-950/80 text-red-200";
    case "success":
      return "bg-emerald-950/80 text-emerald-200";
    case "running":
      return "bg-amber-950/80 text-amber-200";
    case "warning":
      return "bg-yellow-950/80 text-yellow-200";
    default:
      return "bg-zinc-900 text-zinc-300";
  }
}
