interface ExploredFilesSummaryProps {
  fileCount: number;
  listCount?: number;
}

export function ExploredFilesSummary({
  fileCount,
  listCount = 1,
}: ExploredFilesSummaryProps) {
  return (
    <div className="text-xs text-zinc-500 mb-3">
      Explored {fileCount} file{fileCount !== 1 ? "s" : ""}, {listCount} list
      {listCount !== 1 ? "s" : ""}
    </div>
  );
}
