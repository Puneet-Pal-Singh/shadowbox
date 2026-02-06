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
  untracked: "text-gray-400",
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
    <div className={`border-b border-gray-800 ${isSelected ? "bg-gray-800" : ""}`}>
      <div className="flex items-center gap-2 px-4 py-2 hover:bg-gray-900 transition-colors">
        <input
          type="checkbox"
          checked={isStaged}
          onChange={(e) => onToggleStaged(e.target.checked)}
          className="w-4 h-4 rounded cursor-pointer"
        />

        <button
          onClick={() => setExpanded(!expanded)}
          className="p-0 hover:bg-gray-700 rounded transition-colors"
        >
          {expanded ? (
            <ChevronDown size={16} className="text-gray-400" />
          ) : (
            <ChevronRight size={16} className="text-gray-400" />
          )}
        </button>

        <span
          className={`w-6 font-mono font-bold text-sm ${statusColors[file.status]}`}
        >
          {statusLabels[file.status]}
        </span>

        <button
          onClick={onSelect}
          className="flex-1 text-left font-mono text-sm text-gray-300 hover:text-white transition-colors truncate"
        >
          {file.path}
        </button>

        <div className="flex gap-2 text-xs text-gray-400 flex-shrink-0">
          {file.additions > 0 && (
            <span className="text-green-400">+{file.additions}</span>
          )}
          {file.deletions > 0 && (
            <span className="text-red-400">-{file.deletions}</span>
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-8 py-2 bg-gray-900/50 border-t border-gray-800 text-xs text-gray-400">
          <p className="truncate">{file.path}</p>
        </div>
      )}
    </div>
  );
}
