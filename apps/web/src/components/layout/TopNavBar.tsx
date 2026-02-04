import { motion } from "framer-motion";
import { NewThreadButton } from "../navigation/NewThreadButton";
import { UpgradeButton } from "../navigation/UpgradeButton";
import { OpenDropdown } from "../navigation/OpenDropdown";
import { CommitDropdown } from "../navigation/CommitDropdown";
import { WindowControls } from "../ui/WindowControls";
import { ChangeCounter } from "../ui/ChangeCounter";

interface TopNavBarProps {
  onNewThread?: () => void;
  onUpgrade?: () => void;
  onOpenIde?: (ide: string) => void;
  onCommit?: () => void;
  onPush?: () => void;
  onStash?: () => void;
  changesAdded?: number;
  changesRemoved?: number;
}

export function TopNavBar({
  onNewThread,
  onUpgrade,
  onOpenIde,
  onCommit,
  onPush,
  onStash,
  changesAdded = 5446,
  changesRemoved = 0,
}: TopNavBarProps) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="h-12 bg-[#0c0c0e] border-b border-[#1a1a1a] flex items-center justify-between px-4 shrink-0 z-50 shadow-sm shadow-black/20"
    >
      {/* Left Section */}
      <div className="flex items-center gap-2">
        <NewThreadButton onClick={onNewThread} />
      </div>

      {/* Center Section */}
      <div className="flex items-center">
        <UpgradeButton onClick={onUpgrade} />
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-3">
        <OpenDropdown onSelect={onOpenIde} />
        <CommitDropdown onCommit={onCommit} onPush={onPush} onStash={onStash} />
        <div className="w-px h-4 bg-zinc-800" />
        <WindowControls />
        <ChangeCounter added={changesAdded} removed={changesRemoved} />
      </div>
    </motion.header>
  );
}
