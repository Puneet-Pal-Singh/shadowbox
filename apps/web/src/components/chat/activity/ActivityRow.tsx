import type { ActivityFeedRowViewModel } from "../../../services/activity/ActivityFeedViewModel.js";

interface ActivityRowProps {
  row: ActivityFeedRowViewModel;
  expanded: boolean;
  onToggle: (expanded: boolean) => void;
  onUsePlanInBuild?: () => void;
  displayMode?: "card" | "transcript";
  collapsible?: boolean;
}

export function ActivityRow({
  row,
  expanded,
  onToggle,
  onUsePlanInBuild,
  displayMode = "card",
  collapsible = true,
}: ActivityRowProps) {
  switch (row.kind) {
    case "text":
      return null;
    case "reasoning":
      return (
        <ReasoningRow
          row={row}
          expanded={expanded}
          onToggle={onToggle}
          displayMode={displayMode}
          collapsible={collapsible}
        />
      );
    case "approval":
      return (
        <ApprovalRow
          row={row}
          expanded={expanded}
          onToggle={onToggle}
          displayMode={displayMode}
          collapsible={collapsible}
        />
      );
    case "handoff":
      return (
        <HandoffRow
          row={row}
          expanded={expanded}
          onToggle={onToggle}
          onUsePlanInBuild={onUsePlanInBuild}
          displayMode={displayMode}
          collapsible={collapsible}
        />
      );
    case "group":
      return (
        <GroupRow
          row={row}
          expanded={expanded}
          onToggle={onToggle}
          onUsePlanInBuild={onUsePlanInBuild}
          displayMode={displayMode}
          collapsible={collapsible}
        />
      );
    case "tool":
      return (
        <ToolRow
          row={row}
          expanded={expanded}
          onToggle={onToggle}
          displayMode={displayMode}
          collapsible={collapsible}
        />
      );
  }
}

function ReasoningRow({
  row,
  expanded,
  onToggle,
  displayMode,
  collapsible,
}: {
  row: Extract<ActivityFeedRowViewModel, { kind: "reasoning" }>;
  expanded: boolean;
  onToggle: (expanded: boolean) => void;
  displayMode: "card" | "transcript";
  collapsible: boolean;
}) {
  return (
    <ExpandableRow
      label={row.label}
      summary={row.summary}
      expanded={expanded}
      onToggle={onToggle}
      tone={row.status === "active" ? "running" : "completed"}
      displayMode={displayMode}
      collapsible={collapsible}
    >
      <div className="text-xs text-cyan-100/80">{row.summary}</div>
    </ExpandableRow>
  );
}

function ApprovalRow({
  row,
  expanded,
  onToggle,
  displayMode,
  collapsible,
}: {
  row: Extract<ActivityFeedRowViewModel, { kind: "approval" }>;
  expanded: boolean;
  onToggle: (expanded: boolean) => void;
  displayMode: "card" | "transcript";
  collapsible: boolean;
}) {
  return (
    <ExpandableRow
      label="Approval Required"
      summary={row.summary}
      expanded={expanded}
      onToggle={onToggle}
      tone={row.status === "granted" ? "completed" : "requested"}
      displayMode={displayMode}
      collapsible={collapsible}
    >
      <div className="text-xs text-orange-100/70">
        {row.details || "No extra details."}
      </div>
    </ExpandableRow>
  );
}

function HandoffRow({
  row,
  expanded,
  onToggle,
  onUsePlanInBuild,
  displayMode,
  collapsible,
}: {
  row: Extract<ActivityFeedRowViewModel, { kind: "handoff" }>;
  expanded: boolean;
  onToggle: (expanded: boolean) => void;
  onUsePlanInBuild?: () => void;
  displayMode: "card" | "transcript";
  collapsible: boolean;
}) {
  return (
    <ExpandableRow
      label="Build Handoff"
      summary={row.summary}
      expanded={expanded}
      onToggle={onToggle}
      tone="completed"
      displayMode={displayMode}
      collapsible={collapsible}
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
}

function GroupRow({
  row,
  expanded,
  onToggle,
  onUsePlanInBuild,
  displayMode,
  collapsible,
}: {
  row: Extract<ActivityFeedRowViewModel, { kind: "group" }>;
  expanded: boolean;
  onToggle: (expanded: boolean) => void;
  onUsePlanInBuild?: () => void;
  displayMode: "card" | "transcript";
  collapsible: boolean;
}) {
  return (
    <ExpandableRow
      label={row.title}
      summary={row.summary}
      expanded={expanded}
      onToggle={onToggle}
      tone={row.status}
      displayMode={displayMode}
      collapsible={collapsible}
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
            collapsible={false}
          />
        ))}
      </div>
    </ExpandableRow>
  );
}

function ToolRow({
  row,
  expanded,
  onToggle,
  displayMode,
  collapsible,
}: {
  row: Extract<ActivityFeedRowViewModel, { kind: "tool" }>;
  expanded: boolean;
  onToggle: (expanded: boolean) => void;
  displayMode: "card" | "transcript";
  collapsible: boolean;
}) {
  return (
    <ExpandableRow
      label={row.title}
      summary={row.summary}
      expanded={expanded}
      onToggle={onToggle}
      tone={row.status}
      displayMode={displayMode}
      collapsible={collapsible}
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

function ExpandableRow({
  label,
  summary,
  expanded,
  onToggle,
  children,
  tone = "completed",
  displayMode = "card",
  collapsible = true,
}: {
  label: string;
  summary: string;
  expanded: boolean;
  onToggle: (expanded: boolean) => void;
  children: React.ReactNode;
  tone?: "requested" | "running" | "completed" | "failed";
  displayMode?: "card" | "transcript";
  collapsible?: boolean;
}) {
  if (!collapsible) {
    return (
      <div className="rounded-xl border border-zinc-900/80 bg-zinc-950/40 px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-zinc-100">
            <span className={statusDotClassName(tone)} aria-hidden="true" />
            <span className="truncate font-medium">{label}</span>
          </div>
          <div className={`mt-1 text-xs ${toneClassName(tone)}`}>{summary}</div>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    );
  }

  if (displayMode === "transcript") {
    return (
      <div className="rounded-xl border border-zinc-900/80 bg-zinc-950/40 px-3 py-2">
        <button
          type="button"
          onClick={() => onToggle(expanded)}
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
        onClick={() => onToggle(expanded)}
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
