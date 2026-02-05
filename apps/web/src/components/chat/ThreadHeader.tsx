import { MoreHorizontal, Play } from "lucide-react";
import { motion } from "framer-motion";

interface ThreadHeaderProps {
  title: string;
  projectName?: string;
  onRun?: () => void;
  onMore?: () => void;
}

export function ThreadHeader({
  title,
  projectName = "shadowbox",
  onRun,
  onMore,
}: ThreadHeaderProps) {
  return (
    <header className="h-12 border-b border-[#1a1a1a] bg-black flex items-center justify-between px-4 shrink-0">
      {/* Left: Title and Project */}
      <div className="flex items-center gap-2">
        <h1 className="text-sm font-medium text-white truncate max-w-md">
          {title}
        </h1>
        <span className="text-sm text-zinc-600">{projectName}</span>
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={onMore}
          className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <MoreHorizontal size={16} />
        </motion.button>
      </div>

      {/* Right: Run button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onRun}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
      >
        <Play size={14} className="fill-current" />
        <span>Run</span>
      </motion.button>
    </header>
  );
}
