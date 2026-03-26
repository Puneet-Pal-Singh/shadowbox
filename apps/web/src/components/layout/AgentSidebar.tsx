import { Check, FolderPlus, ListFilter, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  onAddRepository: () => void;
  width?: number;
}

type TaskStatusFilter =
  | "all"
  | "running"
  | "idle"
  | "completed"
  | "failed";

const FILTER_OPTIONS: Array<{ value: TaskStatusFilter; label: string }> = [
  { value: "all", label: "All tasks" },
  { value: "running", label: "Running" },
  { value: "failed", label: "Failed" },
  { value: "completed", label: "Completed" },
  { value: "idle", label: "Idle" },
];

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
  statusFilter: TaskStatusFilter,
): SidebarTaskItem[] {
  return tasks.filter((task) => {
    if (statusFilter !== "all" && task.status !== statusFilter) return false;
    if (!query) return true;
    return matchesSearch(task.title, query);
  });
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
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>("all");
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const normalizedQuery = normalizeSearch(searchQuery);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      if (
        filterMenuRef.current &&
        !filterMenuRef.current.contains(event.target as Node)
      ) {
        setIsFilterMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const repositorySource = useMemo(() => {
    const combined = new Set<string>();
    repositories.forEach((repository) => combined.add(repository));
    sessions.forEach((session) => {
      const normalizedRepository = session.repository.trim();
      if (normalizedRepository.length > 0) {
        combined.add(normalizedRepository);
      }
    });
    return Array.from(combined);
  }, [repositories, sessions]);

  const repositorySections = useMemo(() => {
    return repositorySource
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

        const statusFilteredTasks = filterTasks(allTasks, "", statusFilter);
        const filteredTasks = filterTasks(allTasks, normalizedQuery, statusFilter);
        const repoMatches = normalizedQuery
          ? matchesSearch(repository, normalizedQuery) ||
            matchesSearch(getRepositoryLabel(repository), normalizedQuery)
          : true;
        const tasksToRender = repoMatches ? statusFilteredTasks : filteredTasks;

        return {
          repository,
          repositoryLabel: getRepositoryLabel(repository),
          tasks: tasksToRender,
          shouldRender: repoMatches || filteredTasks.length > 0,
        };
      })
      .filter((section) => section.shouldRender);
  }, [activeSessionId, normalizedQuery, repositorySource, sessions, statusFilter]);

  const utility = (
    <div className="space-y-2.5">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2 top-2 text-zinc-600"
          size={13}
        />
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search tasks and workspaces"
          className="h-8 w-full rounded-lg border border-zinc-700/40 bg-zinc-900/30 pl-7 pr-2 text-xs text-zinc-300 outline-none transition-colors placeholder:text-zinc-600 focus:border-zinc-600/60"
          aria-label="Search tasks"
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
          Workspaces
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Add workspace"
            onClick={onAddRepository}
            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800/60 hover:text-zinc-200"
            title="Add workspace"
          >
            <FolderPlus size={14} aria-hidden="true" />
          </button>
          <div className="relative" ref={filterMenuRef}>
            <button
              type="button"
              aria-label="Filter tasks"
              onClick={() => setIsFilterMenuOpen((value) => !value)}
              className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800/60 hover:text-zinc-200"
              title="Filter tasks"
              aria-haspopup="menu"
              aria-expanded={isFilterMenuOpen}
            >
              <ListFilter
                size={14}
                aria-hidden="true"
                className={statusFilter !== "all" ? "text-emerald-300" : undefined}
              />
            </button>

            {isFilterMenuOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-8 z-30 w-48 rounded-xl border border-zinc-700 bg-zinc-900/95 p-2 shadow-2xl"
              >
                <div className="px-1 pb-1 text-xs font-medium text-zinc-400">
                  Show
                </div>
                {FILTER_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setStatusFilter(option.value);
                      setIsFilterMenuOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm text-zinc-200 transition-colors hover:bg-zinc-800"
                    role="menuitemradio"
                    aria-checked={statusFilter === option.value}
                  >
                    <span>{option.label}</span>
                    {statusFilter === option.value ? (
                      <Check size={14} className="text-zinc-300" />
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );

  const footer = (
    <button
      type="button"
      onClick={onAddRepository}
      className="inline-flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-200"
    >
      <FolderPlus size={13} className="text-zinc-500" />
      Add repository
    </button>
  );

  return (
    <SidebarShell width={width} utility={utility} footer={footer} onClose={onClose}>
      <div className="space-y-3">
        {repositorySections.map((section) => (
          <WorkspaceSection
            key={section.repository}
            workspaceName={section.repositoryLabel}
            tasks={section.tasks}
            onSelectTask={onSelect}
            onAddTask={() => onCreate(section.repository)}
            onRemoveTask={onRemove}
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
