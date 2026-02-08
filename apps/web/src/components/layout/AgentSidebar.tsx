import {
  Pencil,
  ListFilter,
  FolderPlus,
  Settings,
  PanelLeftClose,
} from "lucide-react";
import { motion } from "framer-motion";
import { AgentSession } from "../../hooks/useSessionManager";
import { SidebarNavItem } from "../navigation/SidebarNavItem";
import { RepositorySection } from "../navigation/ThreadList";
import { SidebarSection } from "../navigation/SidebarSection";

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
  width = 220,
}: AgentSidebarProps) {
  return (
    <aside
      className="border-r border-[#1a1a1a] flex flex-col bg-[#0c0c0e] overflow-hidden"
      style={{ width }}
    >
      {/* Sidebar Header - App Icon and Close Button */}
      <div className="flex items-center justify-between p-2 shrink-0">
        {/* App Icon - Left */}
        <div className="flex items-center text-zinc-300 font-mono text-sm">
          &lt;_
        </div>

        {/* Close Button - Right */}
        <motion.button
          onClick={onClose}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors rounded-md hover:bg-zinc-800/50"
          title="Close sidebar"
        >
          <PanelLeftClose size={16} />
        </motion.button>
      </div>

      {/* Main Navigation */}
      <div className="px-2.5 pb-2.5 space-y-0.5">
        <SidebarNavItem icon={Pencil} label="New task" onClick={() => onCreate()} />
      </div>

      {/* Tasks Section */}
      <div className="flex-1 overflow-y-auto px-2.5">
        <SidebarSection
          title="TASKS"
          action={{
            icon: FolderPlus,
            onClick: onAddRepository || (() => {}),
            label: "New repo",
          }}
          secondaryAction={{
            icon: ListFilter,
            onClick: () => console.log("Filter tasks"),
            label: "Filter",
          }}
        >
          {repositories.map((repo) => {
            const repoName = repo.split("/")[1] || repo;
            return (
              <RepositorySection
                key={repo}
                repositoryName={repoName}
                tasks={sessions
                  .filter((s) => s.repository === repo)
                  .map((session) => ({
                    id: session.id,
                    title: session.name,
                    status: (session.status || "idle") as
                      | "running"
                      | "completed"
                      | "error"
                      | "idle",
                    isActive: session.id === activeSessionId,
                  }))}
                onSelectTask={onSelect}
                onRemoveTask={onRemove}
                onAddTask={() => onCreate(repo)}
                onRemoveRepo={() => onRemoveRepository?.(repo)}
                onRenameRepo={(newName) => onRenameRepository?.(repo, newName)}
              />
            );
          })}
          {repositories.length === 0 && (
            <p className="px-3 py-2 text-xs text-zinc-600 italic">No tasks</p>
          )}
        </SidebarSection>
      </div>

      {/* Bottom Section */}
      <div className="p-2.5 border-t border-[#1a1a1a] space-y-0.5">
        <SidebarNavItem
          icon={FolderPlus}
          label="Add repository"
          onClick={onAddRepository}
        />
        <SidebarNavItem
          icon={Settings}
          label="Settings"
          onClick={() => console.log("Settings")}
        />
      </div>

      {/* Version */}
      <div className="px-4 py-2 text-[10px] text-zinc-600 border-t border-[#1a1a1a]">
        Version 1.0.0
      </div>
    </aside>
  );
}
