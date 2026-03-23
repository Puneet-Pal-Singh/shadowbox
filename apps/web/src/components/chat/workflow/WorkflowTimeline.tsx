import { useMemo, useState } from "react";
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

type WorkflowBlocks = ReturnType<typeof buildWorkflowTimelineViewModel>["blocks"];

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
  const [expandedBlocks, setExpandedBlocks] = useState<Record<string, boolean>>({});
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [acknowledgedEventCounts, setAcknowledgedEventCounts] = useState<
    Record<string, number>
  >(() => buildAcknowledgedEventCounts(viewModel.blocks));
  const effectiveAcknowledgedEventCounts = useMemo(
    () =>
      buildEffectiveAcknowledgedEventCounts(
        viewModel.blocks,
        acknowledgedEventCounts,
      ),
    [acknowledgedEventCounts, viewModel.blocks],
  );

  if (events.length === 0 && !summary && !isLoading) {
    return null;
  }

  return (
    <div className="space-y-4">
      <RunSummaryStrip
        summary={viewModel.summary}
        onExpandAll={() => {
          setAcknowledgedEventCounts((previous) => ({
            ...previous,
            ...buildAcknowledgedEventCounts(viewModel.blocks),
          }));
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
              effectiveAcknowledgedEventCounts[block.key] ?? block.eventCount,
              expandedBlocks[block.key] ?? !block.defaultCollapsed,
            )}
            expandedRows={expandedRows}
            onToggle={() => {
              const nextExpanded = !(
                expandedBlocks[block.key] ?? !block.defaultCollapsed
              );
              if (nextExpanded) {
                setAcknowledgedEventCounts((previous) => ({
                  ...previous,
                  [block.key]: block.eventCount,
                }));
              }
              setExpandedBlocks((previous) => ({
                ...previous,
                [block.key]: nextExpanded,
              }));
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

function buildAcknowledgedEventCounts(
  blocks: WorkflowBlocks,
): Record<string, number> {
  return Object.fromEntries(
    blocks.map((block) => [block.key, block.eventCount]),
  );
}

function buildEffectiveAcknowledgedEventCounts(
  blocks: WorkflowBlocks,
  acknowledgedEventCounts: Record<string, number>,
): Record<string, number> {
  const next: Record<string, number> = {};
  for (const block of blocks) {
    next[block.key] = acknowledgedEventCounts[block.key] ?? block.eventCount;
  }
  return next;
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
