import { useMemo, useState } from "react";
import type { FileStatus } from "@repo/shared-types";
import { ChangeItem } from "./ChangeItem";

interface ChangesListProps {
  files: FileStatus[];
  selectedFile: FileStatus | null;
  onSelectFile: (file: FileStatus) => void;
  stagedFiles: Set<string>;
  onToggleStaged: (path: string, staged: boolean) => void;
  className?: string;
}

export function ChangesList({
  files,
  selectedFile,
  onSelectFile,
  stagedFiles,
  onToggleStaged,
  className = "",
}: ChangesListProps) {
  const [filter, setFilter] = useState<"all" | "staged" | "unstaged">("all");

  const filteredFiles = useMemo(() => {
    return files.filter((file) => {
      if (filter === "staged") return stagedFiles.has(file.path);
      if (filter === "unstaged") return !stagedFiles.has(file.path);
      return true;
    });
  }, [files, filter, stagedFiles]);

  const stats = useMemo(() => {
    return {
      total: files.length,
      staged: Array.from(stagedFiles).length,
      unstaged: files.length - Array.from(stagedFiles).length,
    };
  }, [files, stagedFiles]);

  return (
    <div className={`flex flex-col h-full bg-black ${className}`}>
      <div className="px-4 py-3 border-b border-zinc-800 bg-black">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">
            Uncommitted Changes
          </h3>
          <span className="text-xs text-zinc-500">
            {stats.staged}/{stats.total}
          </span>
        </div>

        <div className="flex gap-2 text-xs">
          <button
            onClick={() => setFilter("all")}
            className={`px-2 py-1 rounded transition-colors ${
              filter === "all"
                ? "bg-zinc-800 text-white"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            All ({stats.total})
          </button>
          <button
            onClick={() => setFilter("staged")}
            className={`px-2 py-1 rounded transition-colors ${
              filter === "staged"
                ? "bg-zinc-800 text-white"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Staged ({stats.staged})
          </button>
          <button
            onClick={() => setFilter("unstaged")}
            className={`px-2 py-1 rounded transition-colors ${
              filter === "unstaged"
                ? "bg-zinc-800 text-white"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Unstaged ({stats.unstaged})
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-black">
        {filteredFiles.length === 0 ? (
          <div className="p-4 text-center text-zinc-500 text-sm">
            {filter === "all"
              ? "No changes"
              : filter === "staged"
                ? "No staged files"
                : "No unstaged files"}
          </div>
        ) : (
          filteredFiles.map((file) => (
            <ChangeItem
              key={file.path}
              file={file}
              isSelected={selectedFile?.path === file.path}
              isStaged={stagedFiles.has(file.path)}
              onSelect={() => onSelectFile(file)}
              onToggleStaged={(staged) => onToggleStaged(file.path, staged)}
            />
          ))
        )}
      </div>
    </div>
  );
}