import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { FileStatus } from "@repo/shared-types";

interface ChangeItemProps {
  file: FileStatus;
  isSelected: boolean;
  isStaged: boolean;
  onSelect: () => void;
  onToggleStaged: (staged: boolean) => void;
}

const statusColors: Record<FileStatus["status"], string> = {
  modified: "text-yellow-400",
  added: "text-green-400",
  deleted: "text-red-400",
  renamed: "text-blue-400",
  untracked: "text-zinc-500",
};

const statusLabels: Record<FileStatus["status"], string> = {
  modified: "M",
  added: "A",
  deleted: "D",
  renamed: "R",
  untracked: "?",
};

export function ChangeItem({
  file,
  isSelected,
  isStaged,
  onSelect,
  onToggleStaged,
}: ChangeItemProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`border-b border-zinc-800 ${isSelected ? "bg-zinc-900" : "bg-black"}`}>
      <div className="flex items-center gap-2 px-4 py-2 hover:bg-zinc-900/50 transition-colors">
        <input
          type="checkbox"
          checked={isStaged}
          onChange={(e) => onToggleStaged(e.target.checked)}
          className="w-4 h-4 rounded cursor-pointer accent-emerald-500 bg-zinc-800 border-zinc-600"
        />

        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="p-0 hover:bg-zinc-800 rounded transition-colors text-zinc-500 hover:text-zinc-300"
        >
          {expanded ? (
            <ChevronDown size={16} />
          ) : (
            <ChevronRight size={16} />
          )}
        </button>

        <span
          className={`w-4 font-mono font-bold text-xs ${statusColors[file.status]}`}
        >
          {statusLabels[file.status]}
        </span>

        <button
          onClick={onSelect}
          className="flex-1 text-left font-mono text-sm text-zinc-300 hover:text-white transition-colors truncate"
        >
          {file.path}
        </button>

        <div className="flex gap-2 text-xs text-zinc-500 flex-shrink-0">
          {file.additions > 0 && (
            <span className="text-emerald-500">+{file.additions}</span>
          )}
          {file.deletions > 0 && (
            <span className="text-red-500">-{file.deletions}</span>
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-8 py-2 bg-zinc-900/30 border-t border-zinc-800 text-xs text-zinc-400">
          <p className="truncate">{file.path}</p>
        </div>
      )}
    </div>
  );
}