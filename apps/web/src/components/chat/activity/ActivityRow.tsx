import type { ActivityFeedRowViewModel } from "../../../services/activity/ActivityFeedViewModel.js";

interface ActivityRowProps {
  row: ActivityFeedRowViewModel;
  expanded: boolean;
  onToggle: () => void;
  onUsePlanInBuild?: () => void;
  displayMode?: "card" | "transcript";
}

export function ActivityRow({
  row,
  expanded,
  onToggle,
  onUsePlanInBuild,
  displayMode = "card",
}: ActivityRowProps) {
  switch (row.kind) {
    case "text":
      return null;
    case "reasoning":
      return (
        <ExpandableRow
          label={row.label}
          summary={row.summary}
          expanded={expanded}
          onToggle={onToggle}
          tone={row.status === "active" ? "running" : "completed"}
          displayMode={displayMode}
        >
          <div className="text-xs text-cyan-100/80">{row.summary}</div>
        </ExpandableRow>
      );
    case "approval":
      return (
        <ExpandableRow
          label="Approval Required"
          summary={row.summary}
          expanded={expanded}
          onToggle={onToggle}
          tone={row.status === "granted" ? "completed" : "requested"}
          displayMode={displayMode}
        >
          {row.details ? (
            <div className="text-xs text-orange-100/70">{row.details}</div>
          ) : (
            <div className="text-xs text-orange-100/70">No extra details.</div>
          )}
        </ExpandableRow>
      );
    case "handoff":
      return (
        <ExpandableRow
          label="Build Handoff"
          summary={row.summary}
          expanded={expanded}
          onToggle={onToggle}
          tone="completed"
          displayMode={displayMode}
        >
          <div className="space-y-3">
            <pre className="overflow-x-auto rounded-xl border border-emerald-900/60 bg-black/40 px-3 py-2 text-xs text-emerald-100/80">
              {row.prompt}
            </pre>
            {onUsePlanInBuild ? (
              <button
                type="button"
                onClick={onUsePlanInBuild}
                className="rounded-full border border-emerald-700/70 bg-emerald-950/40 px-3 py-1.5 text-xs font-medium text-emerald-100 transition hover:border-emerald-500 hover:bg-emerald-900/40"
              >
                Execute Plan in Build
              </button>
            ) : null}
          </div>
        </ExpandableRow>
      );
    case "group":
      return (
        <ExpandableRow
          label={row.title}
          summary={row.summary}
          expanded={expanded}
          onToggle={onToggle}
          displayMode={displayMode}
        >
          <div className="space-y-2">
            {row.rows.map((groupRow) => (
              <ActivityRow
                key={groupRow.key}
                row={groupRow}
                expanded={true}
                onToggle={() => undefined}
                onUsePlanInBuild={onUsePlanInBuild}
                displayMode="transcript"
              />
            ))}
          </div>
        </ExpandableRow>
      );
    case "tool":
      return (
        <ExpandableRow
          label={row.title}
          summary={row.summary}
          expanded={expanded}
          onToggle={onToggle}
          tone={row.status}
          displayMode={displayMode}
        >
          {row.details.length > 0 ? (
            <div className="space-y-2">
              {row.details.map((detail, index) => (
                <pre
                  key={`${row.key}-detail-${index}`}
                  className="overflow-x-auto rounded-xl border border-zinc-800/70 bg-black/40 px-3 py-2 text-xs text-zinc-200"
                >
                  {detail}
                </pre>
              ))}
            </div>
          ) : (
            <div className="text-xs text-zinc-500">No extra details.</div>
          )}
        </ExpandableRow>
      );
  }
}

function ExpandableRow({
  label,
  summary,
  expanded,
  onToggle,
  children,
  tone = "completed",
  displayMode = "card",
}: {
  label: string;
  summary: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  tone?: "requested" | "running" | "completed" | "failed";
  displayMode?: "card" | "transcript";
}) {
  if (displayMode === "transcript") {
    return (
      <div className="rounded-xl border border-zinc-900/80 bg-zinc-950/40 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm text-zinc-100">
              <span className={statusDotClassName(tone)} aria-hidden="true" />
              <span className="truncate font-medium">{label}</span>
            </div>
            <div className={`mt-1 text-xs ${toneClassName(tone)}`}>
              {summary}
            </div>
          </div>
          <div className="shrink-0 text-[11px] text-zinc-500">
            {expanded ? "Hide" : "Show"}
          </div>
        </button>
        {expanded ? <div className="mt-3">{children}</div> : null}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-black/30 px-4 py-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-4 text-left"
      >
        <div>
          <div className="text-sm font-medium text-zinc-100">{label}</div>
          <div className={`mt-1 text-xs ${toneClassName(tone)}`}>{summary}</div>
        </div>
        <div className="text-xs text-zinc-500">
          {expanded ? "Hide" : "Show"}
        </div>
      </button>
      {expanded ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

function toneClassName(tone: string): string {
  switch (tone) {
    case "running":
      return "text-cyan-300";
    case "failed":
      return "text-red-300";
    case "requested":
      return "text-amber-300";
    default:
      return "text-zinc-400";
  }
}

function statusDotClassName(tone: string): string {
  switch (tone) {
    case "running":
      return "h-2 w-2 rounded-full bg-cyan-400";
    case "failed":
      return "h-2 w-2 rounded-full bg-red-400";
    case "requested":
      return "h-2 w-2 rounded-full bg-amber-400";
    default:
      return "h-2 w-2 rounded-full bg-zinc-500";
  }
}
