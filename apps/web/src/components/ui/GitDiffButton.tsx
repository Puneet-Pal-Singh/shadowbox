import { GitCompare } from "lucide-react";
import { motion } from "framer-motion";

interface GitDiffButtonProps {
  onClick?: () => void;
}

export function GitDiffButton({ onClick }: GitDiffButtonProps) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 bg-zinc-900/50 hover:bg-zinc-800/50 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-all duration-200"
      title="Show git diff"
    >
      <GitCompare size={16} />
    </motion.button>
  );
}
