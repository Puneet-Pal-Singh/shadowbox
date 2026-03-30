import { ChevronDown, ChevronRight } from "lucide-react";
import type {
  WorkflowBlockViewModel,
  WorkflowDetailRowViewModel,
} from "../../../services/workflow/WorkflowTimelineViewModel.js";
import { cn } from "../../../lib/utils.js";
import { ToolCallRow } from "./ToolCallRow.js";

interface WorkflowBlockProps {
  block: WorkflowBlockViewModel;
  expanded: boolean;
  newEventCount: number;
  expandedRows: Record<string, boolean>;
  onToggle: () => void;
  onToggleRow: (rowKey: string) => void;
}

export function WorkflowBlock({
  block,
  expanded,
  newEventCount,
  expandedRows,
  onToggle,
  onToggleRow,
}: WorkflowBlockProps) {
  const isThinkingBlock = block.title === "Thinking" && block.tone === "running";

  return (
    <section
      className={cn(
        "rounded-2xl border bg-zinc-950/70 backdrop-blur-sm",
        getBlockBorderClass(block.tone),
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-start gap-3 px-4 py-4 text-left"
      >
        <span className="mt-0.5 text-zinc-500">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {isThinkingBlock ? (
              <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_14px_rgba(103,232,249,0.9)] animate-pulse-slow" />
            ) : null}
            <h3 className="text-sm font-semibold text-zinc-100">
              {block.title}
            </h3>
            {!isThinkingBlock ? <ToneBadge tone={block.tone} /> : null}
            {block.durationLabel ? (
              <span className="text-xs text-zinc-500">
                {block.durationLabel}
              </span>
            ) : null}
            {!expanded && newEventCount > 0 ? (
              <span className="rounded-full bg-cyan-950/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
                +{newEventCount} new
              </span>
            ) : null}
          </div>
          {block.summary ? (
            <p className="mt-1 text-sm text-zinc-400">{block.summary}</p>
          ) : null}
        </div>
      </button>
      {expanded ? (
        <div className="space-y-3 border-t border-zinc-800/70 px-4 py-4">
          {block.rows.map((row) =>
            row.kind === "tool" ? (
              <ToolCallRow
                key={row.key}
                row={row}
                expanded={expandedRows[row.key] ?? !row.defaultCollapsed}
                onToggle={() => onToggleRow(row.key)}
              />
            ) : (
              <DetailRow key={row.key} row={row} />
            ),
          )}
        </div>
      ) : null}
    </section>
  );
}

function DetailRow({ row }: { row: WorkflowDetailRowViewModel }) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-black/30 px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
        {row.title}
      </div>
      <div className="mt-1 text-sm leading-6 text-zinc-300">{row.summary}</div>
    </div>
  );
}

function ToneBadge({ tone }: { tone: WorkflowBlockViewModel["tone"] }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]",
        getToneBadgeClass(tone),
      )}
    >
      {tone}
    </span>
  );
}

function getBlockBorderClass(tone: WorkflowBlockViewModel["tone"]): string {
  switch (tone) {
    case "failed":
      return "border-red-900/70";
    case "success":
      return "border-emerald-900/60";
    case "running":
      return "border-amber-900/70";
    case "warning":
      return "border-yellow-900/70";
    default:
      return "border-zinc-800/80";
  }
}

function getToneBadgeClass(tone: WorkflowBlockViewModel["tone"]): string {
  switch (tone) {
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
