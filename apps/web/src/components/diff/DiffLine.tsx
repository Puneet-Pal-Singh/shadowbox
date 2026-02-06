import { memo } from "react";
import type { DiffLine as DiffLineType } from "@repo/shared-types";

interface DiffLineProps {
  line: DiffLineType;
  hunksIndex: number;
}

const DiffLine = memo(({ line, hunksIndex }: DiffLineProps) => {
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
        : "text-gray-300";

  const prefix =
    line.type === "added" ? "+" : line.type === "deleted" ? "-" : " ";

  return (
    <div
      className={`flex border-l-2 ${borderColor} ${bgColor} font-mono text-sm`}
      key={`${hunksIndex}-${line.oldLineNumber || line.newLineNumber}`}
    >
      <div className="w-12 flex-shrink-0 bg-gray-900/50 px-2 py-1 text-right text-xs text-gray-500">
        {line.oldLineNumber && <span>{line.oldLineNumber}</span>}
      </div>
      <div className="w-12 flex-shrink-0 bg-gray-900/50 px-2 py-1 text-right text-xs text-gray-500">
        {line.newLineNumber && <span>{line.newLineNumber}</span>}
      </div>
      <div className={`flex-1 px-3 py-1 ${textColor}`}>
        <span className="mr-1 select-none">{prefix}</span>
        <span className="break-all">{line.content}</span>
      </div>
    </div>
  );
});

DiffLine.displayName = "DiffLine";

export default DiffLine;
