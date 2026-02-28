interface ExploredFilesSummaryProps {
  runStatus?: string | null;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  isLoading: boolean;
}

export function ExploredFilesSummary({
  runStatus,
  totalTasks,
  completedTasks,
  failedTasks,
  isLoading,
}: ExploredFilesSummaryProps) {
  const statusLabel = (runStatus ?? (isLoading ? "RUNNING" : "CREATED")).toUpperCase();
  const taskSummary =
    totalTasks > 0
      ? `Tasks ${completedTasks}/${totalTasks} done${failedTasks > 0 ? `, ${failedTasks} failed` : ""}`
      : "No tasks yet";

  return (
    <div className="text-xs text-zinc-500 mb-3">
      {`Run ${statusLabel} • ${taskSummary}`}
    </div>
  );
}
