import type { ReactNode } from "react";
import type { WorkflowTimelineSummary } from "../../../services/workflow/WorkflowTimelineViewModel.js";

interface RunSummaryStripProps {
  summary: WorkflowTimelineSummary;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onJumpToLatest?: () => void;
}

export function RunSummaryStrip({
  summary,
  onExpandAll,
  onCollapseAll,
  onJumpToLatest,
}: RunSummaryStripProps) {
  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/80 px-4 py-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="grid gap-2 text-sm text-zinc-300 md:grid-cols-5 md:gap-4">
          <MetricPill label="Elapsed" value={summary.elapsedLabel} />
          <MetricPill
            label="Tool Calls"
            value={`${summary.totalToolCalls} total`}
          />
          <MetricPill label="Approvals" value={summary.approvalsLabel} />
          <MetricPill label="Failures" value={summary.failuresLabel} />
          <MetricPill label="Agents" value={summary.agentLabel} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onJumpToLatest ? (
            <ActionButton onClick={onJumpToLatest}>Jump to latest</ActionButton>
          ) : null}
          <ActionButton onClick={onExpandAll}>Expand all</ActionButton>
          <ActionButton onClick={onCollapseAll}>Collapse all</ActionButton>
        </div>
      </div>
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-black/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-zinc-100">{value}</div>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
    >
      {children}
    </button>
  );
}
