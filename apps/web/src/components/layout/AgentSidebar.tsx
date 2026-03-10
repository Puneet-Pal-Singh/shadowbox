import { Activity, ChevronDown, FolderPlus, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import type { AgentSession } from "../../hooks/useSessionManager";
import {
  SidebarShell,
  WorkspaceSection,
  type SidebarTaskItem,
  type SidebarTaskStatus,
} from "../navigation/sidebar";

interface AgentSidebarProps {
  sessions: AgentSession[];
  repositories: string[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onCreate: (repo?: string) => void;
  onRemove: (id: string) => void;
  onRemoveRepository?: (repo: string) => void;
  onRenameRepository?: (oldName: string, newName: string) => void;
  onClose?: () => void;
  onAddRepository?: () => void;
  width?: number;
}

function mapSessionStatus(status: AgentSession["status"]): SidebarTaskStatus {
  if (status === "running") return "running";
  if (status === "completed") return "completed";
  if (status === "error") return "failed";
  return "idle";
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

function getRepositoryLabel(repository: string): string {
  const [, name] = repository.split("/");
  return name || repository;
}

function matchesSearch(value: string, query: string): boolean {
  return normalizeSearch(value).includes(query);
}

function filterTasks(
  tasks: SidebarTaskItem[],
  query: string,
  activityFilter: SidebarTaskStatus | "all",
): SidebarTaskItem[] {
  return tasks.filter((task) => {
    if (activityFilter !== "all" && task.status !== activityFilter) return false;
    if (!query) return true;
    return matchesSearch(task.title, query);
  });
}

const ACTIVITY_FILTERS: Array<{
  value: SidebarTaskStatus | "all";
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "running", label: "Running" },
  { value: "idle", label: "Idle" },
  { value: "failed", label: "Failed" },
  { value: "completed", label: "Completed" },
  { value: "needs_approval", label: "Needs approval" },
];

function getActivityFilterLabel(value: SidebarTaskStatus | "all"): string {
  return ACTIVITY_FILTERS.find((filter) => filter.value === value)?.label ?? "All";
}

export function AgentSidebar({
  sessions,
  repositories,
  activeSessionId,
  onSelect,
  onCreate,
  onRemove,
  onRemoveRepository,
  onRenameRepository,
  onClose,
  onAddRepository,
  width = 280,
}: AgentSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activityFilter, setActivityFilter] = useState<SidebarTaskStatus | "all">("all");
  const [isActivityMenuOpen, setIsActivityMenuOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const activityMenuRef = useRef<HTMLDivElement>(null);
  const normalizedQuery = normalizeSearch(searchQuery);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent): void {
      if (
        activityMenuRef.current &&
        !activityMenuRef.current.contains(event.target as Node)
      ) {
        setIsActivityMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const repositorySections = useMemo(() => {
    return repositories
      .map((repository) => {
        const allTasks = sessions
          .filter((session) => session.repository === repository)
          .map<SidebarTaskItem>((session) => ({
            id: session.id,
            title: session.name,
            status: mapSessionStatus(session.status),
            updatedAt: session.updatedAt,
            isActive: session.id === activeSessionId,
          }));

        const filteredTasks = filterTasks(allTasks, normalizedQuery, activityFilter);
        const repoMatches = normalizedQuery
          ? matchesSearch(repository, normalizedQuery) ||
            matchesSearch(getRepositoryLabel(repository), normalizedQuery)
          : true;

        return {
          repository,
          repositoryLabel: getRepositoryLabel(repository),
          tasks: filteredTasks,
          shouldRender: repoMatches || filteredTasks.length > 0,
        };
      })
      .filter((section) => section.shouldRender);
  }, [activeSessionId, activityFilter, normalizedQuery, repositories, sessions]);

  const utility = (
    <div className="flex items-center gap-1.5">
      <div className="relative flex-1">
        <Search
          className="pointer-events-none absolute left-2 top-2 text-zinc-600"
          size={13}
        />
        <input
          ref={searchInputRef}
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search tasks and workspaces"
          className="h-8 w-full rounded-md border border-zinc-800 bg-zinc-950 pl-7 pr-2 text-xs text-zinc-200 outline-none transition-colors placeholder:text-zinc-600 focus:border-zinc-700"
          aria-label="Search tasks"
        />
      </div>

      <div className="relative" ref={activityMenuRef}>
        <button
          type="button"
          onClick={() => setIsActivityMenuOpen((value) => !value)}
          className={cn(
            "inline-flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
            activityFilter === "all"
              ? "border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900"
              : "border-emerald-700/60 bg-emerald-950/40 text-emerald-200",
          )}
          title="Activity filter"
        >
          <Activity size={13} />
          {getActivityFilterLabel(activityFilter)}
          <ChevronDown size={12} className="text-zinc-500" />
        </button>

        {isActivityMenuOpen ? (
          <div className="absolute right-0 top-9 z-20 w-36 rounded-lg border border-zinc-800 bg-zinc-950 p-1 shadow-xl">
            {ACTIVITY_FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setActivityFilter(option.value);
                  setIsActivityMenuOpen(false);
                }}
                className={cn(
                  "w-full rounded px-2 py-1.5 text-left text-xs transition-colors",
                  activityFilter === option.value
                    ? "bg-zinc-900 text-zinc-100"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => onCreate()}
        className="inline-flex items-center justify-center gap-1.5 rounded-md border border-zinc-800 px-2 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-900"
        title="New task"
      >
        <Plus size={13} />
        New
      </button>
    </div>
  );

  const footer = (
    <div className="space-y-1">
      <button
        type="button"
        onClick={onAddRepository}
        className="inline-flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-200"
      >
        <FolderPlus size={13} className="text-zinc-500" />
        Add repository
      </button>
    </div>
  );

  return (
    <SidebarShell width={width} utility={utility} footer={footer} onClose={onClose}>
      <div className="space-y-2">
        {repositorySections.map((section) => (
          <WorkspaceSection
            key={section.repository}
            workspaceName={section.repositoryLabel}
            tasks={section.tasks}
            onSelectTask={onSelect}
            onRemoveTask={onRemove}
            onAddTask={() => onCreate(section.repository)}
            onRemoveWorkspace={() => onRemoveRepository?.(section.repository)}
            onRenameWorkspace={(newName) => onRenameRepository?.(section.repository, newName)}
          />
        ))}

        {repositorySections.length === 0 ? (
          <p className="px-2 py-3 text-xs italic text-zinc-600">No matching tasks or workspaces</p>
        ) : null}
      </div>
    </SidebarShell>
  );
}
