import type { ActivityFeedRowViewModel } from "../../../services/activity/ActivityFeedViewModel.js";

interface ActivityRowProps {
  row: ActivityFeedRowViewModel;
  expanded: boolean;
  onToggle: () => void;
}

export function ActivityRow({ row, expanded, onToggle }: ActivityRowProps) {
  switch (row.kind) {
    case "text":
      return (
        <div className="rounded-2xl border border-zinc-800/80 bg-black/30 px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.24em] text-zinc-500">
            {row.role}
          </div>
          <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-100">
            {row.content}
          </div>
        </div>
      );
    case "reasoning":
      return (
        <div className="rounded-2xl border border-cyan-900/50 bg-cyan-950/20 px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.24em] text-cyan-300/70">
            {row.label}
          </div>
          <div className="mt-2 text-sm text-cyan-50">{row.summary}</div>
        </div>
      );
    case "approval":
      return (
        <div className="rounded-2xl border border-orange-900/50 bg-orange-950/20 px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.24em] text-orange-300/70">
            Approval Required
          </div>
          <div className="mt-2 text-sm text-orange-50">{row.summary}</div>
          {row.details ? (
            <div className="mt-2 text-xs text-orange-100/70">{row.details}</div>
          ) : null}
        </div>
      );
    case "handoff":
      return (
        <div className="rounded-2xl border border-emerald-900/50 bg-emerald-950/20 px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.24em] text-emerald-300/70">
            Build Handoff
          </div>
          <div className="mt-2 text-sm text-emerald-50">{row.summary}</div>
          <pre className="mt-3 overflow-x-auto rounded-xl border border-emerald-900/60 bg-black/40 px-3 py-2 text-xs text-emerald-100/80">
            {row.prompt}
          </pre>
        </div>
      );
    case "group":
      return (
        <ExpandableRow
          label={row.title}
          summary={row.summary}
          expanded={expanded}
          onToggle={onToggle}
        >
          <div className="space-y-2">
            {row.rows.map((groupRow) => (
              <ActivityRow
                key={groupRow.key}
                row={groupRow}
                expanded={true}
                onToggle={() => undefined}
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
}: {
  label: string;
  summary: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  tone?: "requested" | "running" | "completed" | "failed";
}) {
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
