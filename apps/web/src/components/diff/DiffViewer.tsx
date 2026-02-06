import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { DiffContent, DiffHunk, DiffLine as DiffLineType } from "@repo/shared-types";
import DiffLine from "./DiffLine";

interface DiffViewerProps {
  diff: DiffContent;
  className?: string;
}

export function DiffViewer({ diff, className = "" }: DiffViewerProps) {
  const [expandedHunks, setExpandedHunks] = useState<Set<number>>(
    new Set(diff.hunks.map((_: DiffHunk, i: number) => i)),
  );

  const toggleHunk = (index: number) => {
    const newSet = new Set(expandedHunks);
    if (newSet.has(index)) {
      newSet.delete(index);
    } else {
      newSet.add(index);
    }
    setExpandedHunks(newSet);
  };

  if (diff.isBinary) {
    return (
      <div className={`p-4 text-zinc-500 text-sm ${className}`}>
        Binary file: {diff.newPath}
      </div>
    );
  }

  if (diff.isNewFile) {
    return (
      <div className={`p-4 text-zinc-500 text-sm ${className}`}>
        New file: {diff.newPath}
      </div>
    );
  }

  if (diff.isDeleted) {
    return (
      <div className={`p-4 text-zinc-500 text-sm ${className}`}>
        Deleted file: {diff.oldPath}
      </div>
    );
  }

  return (
    <div className={`bg-black rounded-lg overflow-hidden ${className}`}>
      <div className="border-b border-zinc-800 px-4 py-3 bg-zinc-900">
        <p className="text-sm font-mono text-zinc-300">{diff.newPath}</p>
      </div>

      <div className="overflow-x-auto">
        {diff.hunks.length === 0 ? (
          <div className="p-4 text-zinc-500 text-sm">No changes</div>
        ) : (
          diff.hunks.map((hunk: DiffHunk, hunkIndex: number) => (
            <div key={hunkIndex} className="border-b border-zinc-800 last:border-b-0">
              <button
                onClick={() => toggleHunk(hunkIndex)}
                className="w-full flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-sm font-mono transition-colors"
              >
                {expandedHunks.has(hunkIndex) ? (
                  <ChevronDown size={16} />
                ) : (
                  <ChevronRight size={16} />
                )}
                <span>{hunk.header}</span>
              </button>

              {expandedHunks.has(hunkIndex) && (
                <div className="border-t border-zinc-800">
                  {hunk.lines.map((line: DiffLineType, lineIndex: number) => (
                    <DiffLine
                      key={lineIndex}
                      line={line}
                      hunksIndex={hunkIndex}
                    />
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}