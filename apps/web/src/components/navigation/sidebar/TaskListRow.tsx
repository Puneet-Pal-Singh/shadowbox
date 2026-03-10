import { motion } from "framer-motion";
import { Trash2 } from "lucide-react";
import type { KeyboardEvent } from "react";
import { formatTimeAgo } from "../../../lib/timeFormat";
import { cn } from "../../../lib/utils";
import type { SidebarTaskItem, SidebarTaskStatus } from "./types";

interface TaskListRowProps {
  task: SidebarTaskItem;
  tabIndex: number;
  onFocus: () => void;
  onSelect: () => void;
  onRemove?: () => void;
  onMoveFocus: (delta: number) => void;
  buttonRef?: (element: HTMLButtonElement | null) => void;
}

interface StatusVisual {
  label: string;
  dotClass: string;
  labelClass: string;
  animate: boolean;
}

const STATUS_VISUALS: Record<SidebarTaskStatus, StatusVisual> = {
  idle: {
    label: "Idle",
    dotClass: "bg-zinc-500/70",
    labelClass: "text-zinc-400",
    animate: false,
  },
  running: {
    label: "Running",
    dotClass: "bg-emerald-400",
    labelClass: "text-emerald-300",
    animate: true,
  },
  failed: {
    label: "Failed",
    dotClass: "bg-red-400",
    labelClass: "text-red-300",
    animate: false,
  },
  completed: {
    label: "Completed",
    dotClass: "bg-blue-300",
    labelClass: "text-blue-200",
    animate: false,
  },
  needs_approval: {
    label: "Approval",
    dotClass: "bg-amber-400",
    labelClass: "text-amber-300",
    animate: false,
  },
};

function getRelativeTime(updatedAt: string): string {
  const date = new Date(updatedAt);
  return Number.isNaN(date.getTime()) ? "--" : formatTimeAgo(date);
}

function getMetricsLabel(task: SidebarTaskItem): string | null {
  if (task.metrics?.label) return task.metrics.label;
  if (typeof task.metrics?.unreadCount === "number") {
    return `${task.metrics.unreadCount}`;
  }

  if (
    typeof task.metrics?.added === "number" ||
    typeof task.metrics?.removed === "number"
  ) {
    const added = task.metrics?.added ?? 0;
    const removed = task.metrics?.removed ?? 0;
    return `+${added} -${removed}`;
  }

  return null;
}

function handleRowKeyDown(
  event: KeyboardEvent<HTMLButtonElement>,
  onSelect: () => void,
  onMoveFocus: (delta: number) => void,
): void {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    onMoveFocus(1);
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    onMoveFocus(-1);
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onSelect();
  }
}

function StatusDot({ status }: { status: SidebarTaskStatus }) {
  const visual = STATUS_VISUALS[status];

  if (visual.animate) {
    return (
      <motion.span
        className={cn("h-2 w-2 rounded-full", visual.dotClass)}
        animate={{ scale: [1, 1.25, 1], opacity: [1, 0.75, 1] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
      />
    );
  }

  return <span className={cn("h-2 w-2 rounded-full", visual.dotClass)} />;
}

export function TaskListRow({
  task,
  tabIndex,
  onFocus,
  onSelect,
  onRemove,
  onMoveFocus,
  buttonRef,
}: TaskListRowProps) {
  const visual = STATUS_VISUALS[task.status];
  const rowMeta = [visual.label, getRelativeTime(task.updatedAt), getMetricsLabel(task)]
    .filter((entry) => Boolean(entry))
    .join(" · ");

  return (
    <li className="group relative">
      <button
        type="button"
        ref={buttonRef}
        tabIndex={tabIndex}
        role="option"
        aria-selected={task.isActive}
        onFocus={onFocus}
        onClick={onSelect}
        onKeyDown={(event) => handleRowKeyDown(event, onSelect, onMoveFocus)}
        className={cn(
          "h-10 w-full rounded-lg px-2.5 text-left transition-all duration-150",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500",
          task.isActive
            ? "bg-zinc-900 text-zinc-100 ring-1 ring-zinc-700"
            : "text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-100",
          onRemove && "pr-8",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <StatusDot status={task.status} />
            <span
              className={cn(
                "truncate text-sm",
                task.isActive ? "font-semibold" : "font-medium",
              )}
              title={task.title}
            >
              {task.title}
            </span>
          </div>
          <div className={cn("truncate text-[11px]", visual.labelClass)} title={rowMeta}>
            {rowMeta}
          </div>
        </div>
      </button>

      {onRemove ? (
        <button
          type="button"
          aria-label={`Remove ${task.title}`}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-500 opacity-0 transition group-hover:opacity-100 hover:bg-zinc-800 hover:text-red-300"
        >
          <Trash2 size={12} />
        </button>
      ) : null}
    </li>
  );
}
