import { motion } from "framer-motion";
import { PanelLeftOpen, FileDiff } from "lucide-react";
import { OpenDropdown } from "../navigation/OpenDropdown";
import { CommitDropdown } from "../navigation/CommitDropdown";

interface TopNavBarProps {
  onOpenIde?: (ide: string) => void;
  onCommit?: () => void;
  onPush?: () => void;
  onStash?: () => void;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  isRightSidebarOpen?: boolean;
  onToggleRightSidebar?: () => void;
  threadTitle?: string;
}

export function TopNavBar({
  onOpenIde,
  onCommit,
  onPush,
  onStash,
  isSidebarOpen = true,
  onToggleSidebar,
  isRightSidebarOpen = false,
  onToggleRightSidebar,
  threadTitle,
}: TopNavBarProps) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="h-10 bg-[#0c0c0e] border-b border-[#1a1a1a] flex items-center justify-between px-3 shrink-0 z-50 shadow-sm shadow-black/20"
    >
      {/* Left Section - Sidebar Toggle and Thread Title */}
      <div className="flex items-center gap-3">
        {!isSidebarOpen && (
          <motion.button
            onClick={onToggleSidebar}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 transition-colors rounded-md hover:bg-zinc-800/50"
            title="Open sidebar"
          >
            <PanelLeftOpen size={16} />
          </motion.button>
        )}
        {/* Thread Title */}
        {threadTitle && (
          <span className="text-sm font-medium text-white">{threadTitle}</span>
        )}
      </div>

      {/* Center Section - Spacer */}
      <div className="flex-1" />

      {/* Right Section */}
      <div className="flex items-center gap-3">
        <OpenDropdown onSelect={onOpenIde} />
        <CommitDropdown onCommit={onCommit} onPush={onPush} onStash={onStash} />
        
        <motion.button
          onClick={onToggleRightSidebar}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className={`p-1.5 transition-colors rounded-md ${
            isRightSidebarOpen 
              ? "text-white bg-zinc-800 border border-zinc-700" 
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
          }`}
          title="Toggle Git Diff & Files"
        >
          <FileDiff size={18} />
        </motion.button>
      </div>
    </motion.header>
  );
}