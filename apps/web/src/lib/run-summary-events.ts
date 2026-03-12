export const RUN_SUMMARY_REFRESH_EVENT = "shadowbox:run-summary-refresh";

interface RunSummaryRefreshDetail {
  runId: string;
}

export function dispatchRunSummaryRefresh(runId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent<RunSummaryRefreshDetail>(RUN_SUMMARY_REFRESH_EVENT, {
      detail: { runId },
    }),
  );
}
