import { useMemo, useState } from "react";
import type {
  WorkflowBlockViewModel,
  WorkflowRowViewModel,
} from "../../../services/workflow/WorkflowTimelineViewModel.js";

interface WorkflowExpansionState {
  expandedBlocks: Record<string, boolean>;
  expandedRows: Record<string, boolean>;
  newEventCountByBlock: Record<string, number>;
  expandAll: () => void;
  collapseAll: () => void;
  toggleBlock: (block: WorkflowBlockViewModel) => void;
  toggleRow: (row: Extract<WorkflowRowViewModel, { kind: "tool" }>) => void;
}

export function useWorkflowExpansionState(
  blocks: WorkflowBlockViewModel[],
): WorkflowExpansionState {
  const [expandedBlocks, setExpandedBlocks] = useState<Record<string, boolean>>(
    {},
  );
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [acknowledgedEventCounts, setAcknowledgedEventCounts] = useState<
    Record<string, number>
  >(() => buildAcknowledgedEventCounts(blocks));

  const effectiveAcknowledgedEventCounts = useMemo(
    () =>
      buildEffectiveAcknowledgedEventCounts(blocks, acknowledgedEventCounts),
    [acknowledgedEventCounts, blocks],
  );
  const newEventCountByBlock = useMemo(
    () =>
      Object.fromEntries(
        blocks.map((block) => [
          block.key,
          getNewEventCount(
            block.eventCount,
            effectiveAcknowledgedEventCounts[block.key] ?? block.eventCount,
            expandedBlocks[block.key] ?? !block.defaultCollapsed,
          ),
        ]),
      ),
    [blocks, effectiveAcknowledgedEventCounts, expandedBlocks],
  );

  return {
    expandedBlocks,
    expandedRows,
    newEventCountByBlock,
    expandAll: () => {
      setAcknowledgedEventCounts((previous) => ({
        ...previous,
        ...buildAcknowledgedEventCounts(blocks),
      }));
      setExpandedBlocks(
        Object.fromEntries(blocks.map((block) => [block.key, true])),
      );
      setExpandedRows(
        Object.fromEntries(
          blocks.flatMap((block) =>
            block.rows.filter(isToolRow).map((row) => [row.key, true] as const),
          ),
        ),
      );
    },
    collapseAll: () => {
      setExpandedBlocks(
        Object.fromEntries(blocks.map((block) => [block.key, false])),
      );
      setExpandedRows(
        Object.fromEntries(
          blocks.flatMap((block) =>
            block.rows
              .filter(isToolRow)
              .map((row) => [row.key, false] as const),
          ),
        ),
      );
    },
    toggleBlock: (block) => {
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
    },
    toggleRow: (row) => {
      setExpandedRows((previous) => ({
        ...previous,
        [row.key]: !(previous[row.key] ?? !row.defaultCollapsed),
      }));
    },
  };
}

function isToolRow(
  row: WorkflowRowViewModel,
): row is Extract<WorkflowRowViewModel, { kind: "tool" }> {
  return row.kind === "tool";
}

function buildAcknowledgedEventCounts(
  blocks: WorkflowBlockViewModel[],
): Record<string, number> {
  return Object.fromEntries(
    blocks.map((block) => [block.key, block.eventCount]),
  );
}

function buildEffectiveAcknowledgedEventCounts(
  blocks: WorkflowBlockViewModel[],
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
