import { Children } from "react";
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
      return (
        <RecoveryTextRow
          row={row}
          expanded={expanded}
          onToggle={onToggle}
          displayMode={displayMode}
          collapsible={collapsible}
        />
      );
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

function RecoveryTextRow({
  row,
  expanded,
  onToggle,
  displayMode,
  collapsible,
}: {
  row: Extract<ActivityFeedRowViewModel, { kind: "text" }>;
  expanded: boolean;
  onToggle: (expanded: boolean) => void;
  displayMode: "card" | "transcript";
  collapsible: boolean;
}) {
  const { code, resumeHint, resumeActions } = parseRecoveryMetadata(
    row.metadata,
  );
  const label = deriveRecoveryLabel(code);
  const summary = deriveRecoverySummary(row.content, resumeHint);

  return (
    <ExpandableRow
      label={label}
      summary={summary}
      expanded={expanded}
      onToggle={onToggle}
      tone="failed"
      displayMode={displayMode}
      collapsible={collapsible}
    >
      <div className="space-y-2 text-xs text-zinc-200">
        <pre className="overflow-x-auto rounded-xl border border-zinc-800/70 bg-black/40 px-3 py-2 text-xs text-zinc-200">
          {row.content}
        </pre>
        {resumeActions ? (
          <div className="text-zinc-400">Resume options: {resumeActions}</div>
        ) : null}
      </div>
    </ExpandableRow>
  );
}

function parseRecoveryMetadata(metadata: Record<string, unknown> | undefined): {
  code?: string;
  resumeHint: string;
  resumeActions: string;
} {
  return {
    code: typeof metadata?.code === "string" ? metadata.code : undefined,
    resumeHint:
      typeof metadata?.resumeHint === "string" ? metadata.resumeHint : "",
    resumeActions: Array.isArray(metadata?.resumeActions)
      ? metadata.resumeActions
          .filter((action): action is string => typeof action === "string")
          .join(" · ")
      : "",
  };
}

function deriveRecoveryLabel(code: string | undefined): string {
  if (code === "TASK_EXECUTION_TIMEOUT") {
    return "Recoverable timeout";
  }

  if (code === "INCOMPLETE_MUTATION") {
    return "Edit incomplete";
  }

  return "Run update";
}

function deriveRecoverySummary(
  rowContent: string,
  resumeHint: string,
): string {
  return resumeHint || rowContent.split("\n")[0] || "";
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
  if (displayMode === "transcript") {
    return (
      <div className="space-y-1 py-1">
        <div className="text-sm font-medium text-zinc-300">{row.label}</div>
        {row.summary ? (
          <div className="text-sm text-zinc-500">{row.summary}</div>
        ) : null}
      </div>
    );
  }

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
  const details =
    row.details.length > 0 ? (
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
    ) : null;

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
      {details}
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
  const hasChildren = Children.count(children) > 0;

  if (!collapsible) {
    return (
      <div className="space-y-1 py-1">
        <div className="flex min-w-0 items-start gap-2 text-sm text-zinc-300">
          <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-zinc-600" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-medium text-zinc-200">
                {label}
              </span>
              {summary ? (
                <span className={`text-xs ${toneClassName(tone)}`}>
                  {summary}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        {hasChildren ? <div className="ml-5 mt-2">{children}</div> : null}
      </div>
    );
  }

  if (displayMode === "transcript") {
    return (
      <div className="space-y-1 py-1">
        <button
          type="button"
          onClick={() => onToggle(expanded)}
          className="flex w-full items-start gap-2 text-left"
        >
          {hasChildren ? (
            <span className="mt-0.5">
              <ChevronIcon expanded={expanded} muted />
            </span>
          ) : (
            <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-zinc-600" />
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-medium text-zinc-200">
                {label}
              </span>
              {summary ? (
                <span className={`text-xs ${toneClassName(tone)}`}>
                  {summary}
                </span>
              ) : null}
            </div>
          </div>
        </button>
        {hasChildren && expanded ? (
          <div className="ml-5 mt-2">{children}</div>
        ) : null}
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

function ChevronIcon({
  expanded,
  muted = false,
}: {
  expanded: boolean;
  muted?: boolean;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${muted ? "text-zinc-500" : ""} ${
        expanded ? "rotate-90 transition-transform" : "transition-transform"
      }`}
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
