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
      className="h-10 bg-[#0c0c0e] border-b border-[#1a1a1a] flex items-center justify-between px-4 shrink-0 z-50"
    >
      {/* Left Section - Thread Title */}
      {threadTitle && (
        <div className="flex items-center">
          <span className="text-xs font-medium text-white truncate max-w-md">
            {threadTitle}
          </span>
        </div>
      )}

      {/* Right Section */}
      <div className="flex items-center gap-3 ml-auto">
        <OpenDropdown onSelect={onOpenIde} />
        <CommitDropdown onCommit={onCommit} onPush={onPush} onStash={onStash} />
        <GitDiffButton onClick={onShowDiff} />
      </div>
    </motion.header>
  );
}
