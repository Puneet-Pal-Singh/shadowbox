import { useEffect, useMemo, useState } from "react";
import type { RunEvent } from "@repo/shared-types";
import {
  buildWorkflowTimelineViewModel,
  type WorkflowRunSummary,
} from "../../../services/workflow/WorkflowTimelineViewModel.js";
import { RunSummaryStrip } from "./RunSummaryStrip.js";
import { WorkflowBlock } from "./WorkflowBlock.js";

interface WorkflowTimelineProps {
  events: RunEvent[];
  summary: WorkflowRunSummary | null;
  isLoading: boolean;
  onJumpToLatest?: () => void;
}

export function WorkflowTimeline({
  events,
  summary,
  isLoading,
  onJumpToLatest,
}: WorkflowTimelineProps) {
  const viewModel = useMemo(
    () => buildWorkflowTimelineViewModel({ events, summary }),
    [events, summary],
  );
  const [expandedBlocks, setExpandedBlocks] = useState<Record<string, boolean>>(
    {},
  );
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [acknowledgedEventCounts, setAcknowledgedEventCounts] = useState<
    Record<string, number>
  >({});

  useEffect(() => {
    setExpandedBlocks((previous) =>
      syncExpansionState(
        previous,
        viewModel.blocks.map((block) => ({
          key: block.key,
          expanded: !block.defaultCollapsed,
        })),
      ),
    );

    setExpandedRows((previous) =>
      syncExpansionState(
        previous,
        viewModel.blocks.flatMap((block) =>
          block.rows
            .filter((row) => row.kind === "tool")
            .map((row) => ({
              key: row.key,
              expanded: !row.defaultCollapsed,
            })),
        ),
      ),
    );

    setAcknowledgedEventCounts((previous) => {
      const next: Record<string, number> = {};
      let changed = false;

      for (const block of viewModel.blocks) {
        const expanded = expandedBlocks[block.key] ?? !block.defaultCollapsed;
        const value = expanded
          ? block.eventCount
          : (previous[block.key] ?? block.eventCount);
        next[block.key] = value;
        if (previous[block.key] !== value) {
          changed = true;
        }
      }

      if (
        !changed &&
        Object.keys(previous).length === viewModel.blocks.length
      ) {
        return previous;
      }

      return next;
    });
  }, [expandedBlocks, viewModel.blocks]);

  if (events.length === 0 && !summary && !isLoading) {
    return null;
  }

  return (
    <div className="space-y-4">
      <RunSummaryStrip
        summary={viewModel.summary}
        onExpandAll={() => {
          setExpandedBlocks(
            Object.fromEntries(
              viewModel.blocks.map((block) => [block.key, true]),
            ),
          );
          setExpandedRows(
            Object.fromEntries(
              viewModel.blocks.flatMap((block) =>
                block.rows
                  .filter((row) => row.kind === "tool")
                  .map((row) => [row.key, true]),
              ),
            ),
          );
          setAcknowledgedEventCounts(
            Object.fromEntries(
              viewModel.blocks.map((block) => [block.key, block.eventCount]),
            ),
          );
        }}
        onCollapseAll={() => {
          setExpandedBlocks(
            Object.fromEntries(
              viewModel.blocks.map((block) => [block.key, false]),
            ),
          );
          setExpandedRows(
            Object.fromEntries(
              viewModel.blocks.flatMap((block) =>
                block.rows
                  .filter((row) => row.kind === "tool")
                  .map((row) => [row.key, false]),
              ),
            ),
          );
        }}
        onJumpToLatest={onJumpToLatest}
      />

      {viewModel.blocks.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/70 px-4 py-3 text-sm text-zinc-400">
          {isLoading
            ? "Waiting for workflow events from the current run."
            : "No workflow events recorded yet."}
        </div>
      ) : (
        viewModel.blocks.map((block) => (
          <WorkflowBlock
            key={block.key}
            block={block}
            expanded={expandedBlocks[block.key] ?? !block.defaultCollapsed}
            newEventCount={getNewEventCount(
              block.eventCount,
              acknowledgedEventCounts[block.key] ?? block.eventCount,
              expandedBlocks[block.key] ?? !block.defaultCollapsed,
            )}
            expandedRows={expandedRows}
            onToggle={() => {
              const nextExpanded = !(
                expandedBlocks[block.key] ?? !block.defaultCollapsed
              );
              setExpandedBlocks((previous) => ({
                ...previous,
                [block.key]: nextExpanded,
              }));
              if (nextExpanded) {
                setAcknowledgedEventCounts((previous) => ({
                  ...previous,
                  [block.key]: block.eventCount,
                }));
              }
            }}
            onToggleRow={(rowKey) => {
              const row = block.rows.find(
                (candidate) =>
                  candidate.kind === "tool" && candidate.key === rowKey,
              );
              if (!row || row.kind !== "tool") {
                return;
              }
              setExpandedRows((previous) => ({
                ...previous,
                [rowKey]: !(previous[rowKey] ?? !row.defaultCollapsed),
              }));
            }}
          />
        ))
      )}
    </div>
  );
}

function syncExpansionState(
  previous: Record<string, boolean>,
  entries: Array<{ key: string; expanded: boolean }>,
): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  let changed = Object.keys(previous).length !== entries.length;

  for (const entry of entries) {
    const value = previous[entry.key] ?? entry.expanded;
    next[entry.key] = value;
    if (previous[entry.key] !== value) {
      changed = true;
    }
  }

  return changed ? next : previous;
}

function getNewEventCount(
  eventCount: number,
  acknowledgedEventCount: number,
  expanded: boolean,
): number {
  if (expanded) {
    return 0;
  }
  return Math.max(0, eventCount - acknowledgedEventCount);
}
