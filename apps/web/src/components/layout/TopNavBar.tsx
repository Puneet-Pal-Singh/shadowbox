import { motion } from "framer-motion";
import { OpenDropdown } from "../navigation/OpenDropdown";
import { CommitDropdown } from "../navigation/CommitDropdown";
import { GitDiffButton } from "../ui/GitDiffButton";

interface TopNavBarProps {
  onOpenIde?: (ide: string) => void;
  onCommit?: () => void;
  onPush?: () => void;
  onStash?: () => void;
  onShowDiff?: () => void;
  threadTitle?: string;
}

export function TopNavBar({
  onOpenIde,
  onCommit,
  onPush,
  onStash,
  onShowDiff,
  threadTitle,
}: TopNavBarProps) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="h-10 bg-[#0c0c0e] border-b border-[#1a1a1a] flex items-center justify-between px-3 shrink-0 z-50 shadow-sm shadow-black/20"
    >
      {/* Left Section - Empty for balance */}
      <div className="flex items-center gap-2 w-[200px]">
        {/* Spacer to balance the right side */}
      </div>

      {/* Center Section - Thread Title */}
      {threadTitle && (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-xs font-medium text-white truncate max-w-md">
            {threadTitle}
          </span>
        </div>
      )}

      {/* Right Section */}
      <div className="flex items-center justify-end gap-3 w-[200px]">
        <OpenDropdown onSelect={onOpenIde} />
        <CommitDropdown onCommit={onCommit} onPush={onPush} onStash={onStash} />
        <GitDiffButton onClick={onShowDiff} />
      </div>
    </motion.header>
  );
}
