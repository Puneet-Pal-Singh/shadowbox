import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { ActivityFeedSnapshot } from "@repo/shared-types";
import { buildActivityFeedViewModel } from "../../../services/activity/ActivityFeedViewModel.js";
import { ActivityTurn } from "./ActivityTurn.js";

interface ActivityFeedProps {
  feed: ActivityFeedSnapshot | null;
  isLoading: boolean;
  onUsePlanInBuild?: () => void;
  onJumpToLatest?: () => void;
}

export function ActivityFeed({
  feed,
  isLoading,
  onUsePlanInBuild,
  onJumpToLatest,
}: ActivityFeedProps) {
  if (!feed && !isLoading) {
    return null;
  }

  return (
    <ActivityFeedContent
      key={feed?.runId ?? "empty"}
      feed={feed}
      isLoading={isLoading}
      onUsePlanInBuild={onUsePlanInBuild}
      onJumpToLatest={onJumpToLatest}
    />
  );
}

function ActivityFeedContent({
  feed,
  isLoading,
  onUsePlanInBuild,
  onJumpToLatest,
}: ActivityFeedProps) {
  const viewModel = useMemo(() => buildActivityFeedViewModel(feed), [feed]);
  const [expandedTurns, setExpandedTurns] = useState<Record<string, boolean>>(
    {},
  );
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  return (
    <section className="space-y-4">
      <div className="rounded-[1.5rem] border border-amber-900/40 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.12),transparent_32%),linear-gradient(180deg,rgba(24,24,27,0.98),rgba(9,9,11,0.96))] px-4 py-4 shadow-[0_0_0_1px_rgba(245,158,11,0.05)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-amber-300/70">
              Activity Feed
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-sm text-zinc-200">
              <FeedPill
                label="Elapsed"
                value={viewModel.summary.elapsedLabel}
              />
              <FeedPill
                label="Tools"
                value={viewModel.summary.toolCallsLabel}
              />
              {viewModel.summary.approvalsLabel ? (
                <FeedPill
                  label="Approvals"
                  value={viewModel.summary.approvalsLabel}
                />
              ) : null}
              {viewModel.summary.handoffLabel ? (
                <FeedPill
                  label="Handoff"
                  value={viewModel.summary.handoffLabel}
                />
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {onUsePlanInBuild ? (
              <FeedActionButton onClick={onUsePlanInBuild}>
                Execute Plan in Build
              </FeedActionButton>
            ) : null}
            {onJumpToLatest ? (
              <FeedActionButton onClick={onJumpToLatest}>
                Jump to latest
              </FeedActionButton>
            ) : null}
          </div>
        </div>
      </div>

      {viewModel.turns.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/70 px-4 py-3 text-sm text-zinc-400">
          {isLoading
            ? "Waiting for activity from the current run."
            : "No activity recorded yet."}
        </div>
      ) : (
        viewModel.turns.map((turn) => (
          <ActivityTurn
            key={turn.key}
            turn={turn}
            expanded={expandedTurns[turn.key] ?? !turn.defaultCollapsed}
            onToggleTurn={() =>
              setExpandedTurns((current) => ({
                ...current,
                [turn.key]: !(current[turn.key] ?? !turn.defaultCollapsed),
              }))
            }
            expandedRows={expandedRows}
            onToggleRow={(rowKey, expanded) =>
              setExpandedRows((current) => ({
                ...current,
                [rowKey]: !expanded,
              }))
            }
            onUsePlanInBuild={onUsePlanInBuild}
          />
        ))
      )}
    </section>
  );
}

function FeedPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-full border border-zinc-800/80 bg-black/40 px-3 py-1.5">
      <span className="text-zinc-500">{label}: </span>
      <span className="text-zinc-100">{value}</span>
    </div>
  );
}

function FeedActionButton({
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
      className="rounded-full border border-amber-800/60 bg-amber-950/30 px-3 py-1.5 text-xs font-medium text-amber-100 transition hover:border-amber-600 hover:bg-amber-900/40"
    >
      {children}
    </button>
  );
}
