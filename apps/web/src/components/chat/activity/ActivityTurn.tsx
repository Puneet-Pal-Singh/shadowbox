import type {
  ActivityFeedRowViewModel,
  ActivityTurnViewModel,
} from "../../../services/activity/ActivityFeedViewModel.js";
import { ActivityRow } from "./ActivityRow.js";

interface ActivityTurnProps {
  turn: ActivityTurnViewModel;
  expandedRows: Record<string, boolean>;
  onToggleRow: (rowKey: string) => void;
}

export function ActivityTurn({
  turn,
  expandedRows,
  onToggleRow,
}: ActivityTurnProps) {
  return (
    <div className="rounded-[1.25rem] border border-zinc-800/80 bg-zinc-950/80 px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.28em] text-zinc-500">
          {turn.title}
        </div>
        <div className="text-xs text-zinc-500">
          {turn.rows.length} activit{turn.rows.length === 1 ? "y" : "ies"}
        </div>
      </div>
      <div className="space-y-3">
        {turn.rows.map((row) => (
          <ActivityRow
            key={row.key}
            row={row}
            expanded={expandedRows[row.key] ?? !isCollapsedByDefault(row)}
            onToggle={() => onToggleRow(row.key)}
          />
        ))}
      </div>
    </div>
  );
}

function isCollapsedByDefault(row: ActivityFeedRowViewModel): boolean {
  if (row.kind === "tool" || row.kind === "group") {
    return row.defaultCollapsed;
  }
  return false;
}
