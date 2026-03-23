import { useMemo } from "react";
import type { RunEvent } from "@repo/shared-types";
import {
  buildWorkflowTimelineViewModel,
  type WorkflowRunSummary,
} from "../../../services/workflow/WorkflowTimelineViewModel.js";
import { RunSummaryStrip } from "./RunSummaryStrip.js";
import { WorkflowBlock } from "./WorkflowBlock.js";
import { useWorkflowExpansionState } from "./useWorkflowExpansionState.js";

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
  const {
    expandedBlocks,
    expandedRows,
    newEventCountByBlock,
    expandAll,
    collapseAll,
    toggleBlock,
    toggleRow,
  } = useWorkflowExpansionState(viewModel.blocks);

  if (events.length === 0 && !summary && !isLoading) {
    return null;
  }

  return (
    <div className="space-y-4">
      <RunSummaryStrip
        summary={viewModel.summary}
        onExpandAll={expandAll}
        onCollapseAll={collapseAll}
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
            newEventCount={newEventCountByBlock[block.key] ?? 0}
            expandedRows={expandedRows}
            onToggle={() => toggleBlock(block)}
            onToggleRow={(rowKey) => {
              const row = block.rows.find(
                (candidate) =>
                  candidate.kind === "tool" && candidate.key === rowKey,
              );
              if (!row || row.kind !== "tool") {
                return;
              }
              toggleRow(row);
            }}
          />
        ))
      )}
    </div>
  );
}
