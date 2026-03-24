import type {
  ActivityFeedRowViewModel,
  ActivityTurnViewModel,
} from "../../../services/activity/ActivityFeedViewModel.js";
import type { ReactNode } from "react";
import { ActivityRow } from "./ActivityRow.js";

interface ActivityTurnProps {
  turn: ActivityTurnViewModel;
  expanded: boolean;
  onToggleTurn: () => void;
  expandedRows: Record<string, boolean>;
  onToggleRow: (rowKey: string) => void;
  onUsePlanInBuild?: () => void;
  workflowOverview?: ReactNode;
}

export function ActivityTurn({
  turn,
  expanded,
  onToggleTurn,
  expandedRows,
  onToggleRow,
  onUsePlanInBuild,
  workflowOverview,
}: ActivityTurnProps) {
  if (!turn.hasVisibleRows) {
    return null;
  }

  if (turn.isActiveTurn) {
    return (
      <section className="space-y-3 py-2">
        <div className="text-sm font-medium text-zinc-400">
          {turn.elapsedLabel}
        </div>
        <div className="space-y-2">
          {turn.rows.map((row) => (
            <ActivityRow
              key={row.key}
              row={row}
              expanded={expandedRows[row.key] ?? true}
              onToggle={() => onToggleRow(row.key)}
              onUsePlanInBuild={onUsePlanInBuild}
              displayMode="transcript"
            />
          ))}
          {workflowOverview ? (
            <details className="rounded-xl border border-zinc-900/80 bg-zinc-950/40 px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium text-zinc-400">
                Workflow overview
              </summary>
              <div className="mt-3">{workflowOverview}</div>
            </details>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3 py-2">
      <div className="relative">
        <div className="absolute left-0 right-0 top-1/2 border-t border-zinc-800/80" />
        <button
          type="button"
          onClick={onToggleTurn}
          className="relative mx-auto flex items-center gap-2 rounded-full bg-black px-4 py-1 text-sm text-zinc-400 transition hover:text-zinc-100"
        >
          <span>{turn.elapsedLabel}</span>
          <ChevronIcon expanded={expanded} />
        </button>
      </div>

      <div className="rounded-[1.25rem] border border-zinc-800/80 bg-zinc-950/70 px-4 py-3">
        <button
          type="button"
          onClick={onToggleTurn}
          className="flex w-full items-start justify-between gap-4 text-left"
        >
          <div>
            <div className="text-sm font-medium text-zinc-100">
              {turn.summaryLabel}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              {turn.rows.length} workflow step
              {turn.rows.length === 1 ? "" : "s"}
            </div>
          </div>
          <div className="text-xs text-zinc-500">
            {expanded ? "Hide" : "Show"}
          </div>
        </button>

        {expanded ? (
          <div className="mt-4 space-y-3">
            {turn.rows.map((row) => (
              <ActivityRow
                key={row.key}
                row={row}
                expanded={expandedRows[row.key] ?? !isCollapsedByDefault(row)}
                onToggle={() => onToggleRow(row.key)}
                onUsePlanInBuild={onUsePlanInBuild}
                displayMode="card"
              />
            ))}
            {workflowOverview ? (
              <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/40 px-4 py-3">
                <div className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                  Workflow overview
                </div>
                <div className="mt-3">{workflowOverview}</div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function isCollapsedByDefault(row: ActivityFeedRowViewModel): boolean {
  if (row.kind === "tool" || row.kind === "group") {
    return row.defaultCollapsed;
  }
  return false;
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={
        expanded ? "rotate-90 transition-transform" : "transition-transform"
      }
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
