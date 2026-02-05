import {
  Pencil,
  Clock,
  Box,
  Plus,
  ListFilter,
  FolderPlus,
  Settings,
  PanelLeftClose,
} from "lucide-react";
import { motion } from "framer-motion";
import { AgentSession } from "../../hooks/useSessionManager";
import { SidebarNavItem } from "../navigation/SidebarNavItem";
import { ThreadList } from "../navigation/ThreadList";
import { SidebarSection } from "../navigation/SidebarSection";

interface AgentSidebarProps {
  sessions: AgentSession[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRemove: (id: string) => void;
  onClose?: () => void;
}

export function AgentSidebar({
  sessions,
  activeSessionId,
  onSelect,
  onCreate,
  onRemove,
  onClose,
}: AgentSidebarProps) {
  // Convert sessions to thread items
  const threadItems = sessions.map((session) => ({
    id: session.id,
    title: session.name,
    status: session.status as "running" | "completed" | "error",
    isActive: session.id === activeSessionId,
  }));

  return (
    <aside className="w-[220px] border-r border-[#1a1a1a] flex flex-col bg-[#0c0c0e] overflow-hidden">
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
        <SidebarNavItem icon={Pencil} label="New thread" onClick={onCreate} />
        <SidebarNavItem
          icon={Clock}
          label="Automations"
          onClick={() => console.log("Automations")}
        />
        <SidebarNavItem
          icon={Box}
          label="Skills"
          onClick={() => console.log("Skills")}
        />
      </div>

      {/* Threads Section */}
      <div className="flex-1 overflow-y-auto px-2.5">
        <SidebarSection
          title="Threads"
          action={{
            icon: Plus,
            onClick: onCreate,
            label: "New thread",
          }}
          secondaryAction={{
            icon: ListFilter,
            onClick: () => console.log("Filter threads"),
            label: "Filter",
          }}
        >
          <ThreadList
            projectName="shadowbox"
            threads={threadItems}
            onSelectThread={onSelect}
            onRemoveThread={onRemove}
          />
        </SidebarSection>
      </div>

      {/* Bottom Section */}
      <div className="p-2.5 border-t border-[#1a1a1a] space-y-0.5">
        <SidebarNavItem
          icon={FolderPlus}
          label="New project"
          onClick={() => console.log("New project")}
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
