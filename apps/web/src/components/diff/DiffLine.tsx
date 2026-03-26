import { memo } from "react";
import { Plus } from "lucide-react";
import type { DiffLine as DiffLineType } from "@repo/shared-types";

interface DiffLineProps {
  line: DiffLineType;
  hunksIndex: number;
  lineIndex: number;
  isSelected?: boolean;
  annotationCount?: number;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onAddComment?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

const DiffLine = memo(
  ({
    line,
    hunksIndex,
    lineIndex,
    isSelected = false,
    annotationCount = 0,
    onClick,
    onAddComment,
  }: DiffLineProps) => {
    const bgColor =
      line.type === "added"
        ? "bg-green-900/20"
        : line.type === "deleted"
          ? "bg-red-900/20"
          : "";

    const borderColor =
      line.type === "added"
        ? "border-l-green-600"
        : line.type === "deleted"
          ? "border-l-red-600"
          : "border-l-transparent";

    const textColor =
      line.type === "added"
        ? "text-green-300"
        : line.type === "deleted"
          ? "text-red-300"
          : "text-zinc-300";

    const prefix =
      line.type === "added" ? "+" : line.type === "deleted" ? "-" : " ";

    return (
      <div
        onClick={onClick}
        className={`group relative flex w-full border-l-2 text-left font-mono text-sm transition-colors ${
          isSelected ? "bg-sky-500/10" : ""
        } ${borderColor} ${bgColor}`}
        key={`${hunksIndex}-${lineIndex}`}
      >
        {onAddComment ? (
          <span className="absolute left-[4.35rem] top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
            <span
              className={`block rounded-md transition-opacity ${
                isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              }`}
            >
              <span className="block rounded-md bg-sky-500 shadow-[0_0_0_1px_rgba(125,211,252,0.35)]">
                <span className="block">
                  <button
                    type="button"
                    onClick={onAddComment}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-white transition-colors hover:bg-sky-400"
                    aria-label="Add comment"
                  >
                    <Plus size={14} />
                  </button>
                </span>
              </span>
            </span>
          </span>
        ) : null}
        <div className="w-12 flex-shrink-0 bg-zinc-900/50 px-2 py-1 text-right text-xs text-zinc-500">
          {line.oldLineNumber && <span>{line.oldLineNumber}</span>}
        </div>
        <div className="w-12 flex-shrink-0 bg-zinc-900/50 px-2 py-1 text-right text-xs text-zinc-500">
          {line.newLineNumber && <span>{line.newLineNumber}</span>}
        </div>
        <div className={`flex-1 px-3 py-1 ${textColor}`}>
          <span className="mr-1 select-none">{prefix}</span>
          <span className="break-all">{line.content}</span>
        </div>
        {annotationCount > 0 ? (
          <div className="mr-3 flex items-center text-[10px] uppercase tracking-[0.16em] text-amber-300">
            {annotationCount} note{annotationCount === 1 ? "" : "s"}
          </div>
        ) : null}
      </div>
    );
  },
);

DiffLine.displayName = "DiffLine";

export default DiffLine;
