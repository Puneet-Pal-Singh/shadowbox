import { Pencil } from "lucide-react";
import { motion } from "framer-motion";
import { hoverScaleSmall } from "../../lib/animations";

interface NewThreadButtonProps {
  onClick?: () => void;
}

export function NewThreadButton({ onClick }: NewThreadButtonProps) {
  return (
    <motion.button
      onClick={onClick}
      {...hoverScaleSmall}
      className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-zinc-300 hover:text-white transition-colors duration-150 rounded-md hover:bg-zinc-800/50"
    >
      <Pencil size={14} className="text-zinc-400 group-hover:text-zinc-300" />
      <span>New thread</span>
    </motion.button>
  );
}
