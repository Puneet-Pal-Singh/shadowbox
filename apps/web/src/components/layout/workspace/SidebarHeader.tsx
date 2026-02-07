import { motion } from "framer-motion";
import { ArrowLeft, Maximize2 } from "lucide-react";
import { cn } from "../../../lib/utils";
import type { TabType } from "./useWorkspaceState";

interface SidebarHeaderProps {
  isViewingContent: boolean;
  activeTab: TabType;
  changesCount: number;
  onBack: () => void;
  onTabChange: (tab: TabType) => void;
}

export function SidebarHeader({
  isViewingContent,
  activeTab,
  changesCount,
  onBack,
  onTabChange,
}: SidebarHeaderProps) {
  return (
    <div className="h-10 border-b border-zinc-800 flex items-center justify-between px-3 bg-black shrink-0">
      <div className="flex gap-4 h-full">
        {isViewingContent ? (
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={14} />
            Back
          </button>
        ) : (
          <>
            <button
              onClick={() => onTabChange("files")}
              className={cn(
                "text-xs font-semibold uppercase tracking-wide transition-colors relative h-full flex items-center",
                activeTab === "files"
                  ? "text-white"
                  : "text-zinc-500 hover:text-zinc-300",
              )}
            >
              Files
              {activeTab === "files" && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-400"
                />
              )}
            </button>
            <button
              onClick={() => onTabChange("changes")}
              className={cn(
                "text-xs font-semibold uppercase tracking-wide transition-colors relative h-full flex items-center gap-1.5",
                activeTab === "changes"
                  ? "text-white"
                  : "text-zinc-500 hover:text-zinc-300",
              )}
            >
              Changes
              {changesCount > 0 && (
                <span className="px-1.5 py-0.5 bg-zinc-800 text-zinc-300 text-[10px] rounded-full">
                  {changesCount}
                </span>
              )}
              {activeTab === "changes" && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-400"
                />
              )}
            </button>
          </>
        )}
      </div>

      <button
        className="text-zinc-500 hover:text-zinc-300 p-1 rounded hover:bg-zinc-900"
        title="Expand"
      >
        <Maximize2 size={14} />
      </button>
    </div>
  );
}
