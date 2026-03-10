import { FolderPlus, Search } from "lucide-react";
import { useMemo, useRef, useState } from "react";
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
): SidebarTaskItem[] {
  return tasks.filter((task) => {
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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = normalizeSearch(searchQuery);

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

        const filteredTasks = filterTasks(allTasks, normalizedQuery);
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
  }, [activeSessionId, normalizedQuery, repositories, sessions]);

  const utility = (
    <div className="relative">
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
