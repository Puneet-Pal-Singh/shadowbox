import { Minus, Square, X } from "lucide-react";
import { motion } from "framer-motion";

interface WindowControlsProps {
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
}

export function WindowControls({
  onMinimize,
  onMaximize,
  onClose,
}: WindowControlsProps) {
  return (
    <div className="flex items-center gap-2">
      <motion.button
        onClick={onMinimize}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
        title="Minimize"
      >
        <Minus size={14} />
      </motion.button>
      <motion.button
        onClick={onMaximize}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
        title="Maximize"
      >
        <Square size={12} />
      </motion.button>
      <motion.button
        onClick={onClose}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
        title="Close"
      >
        <X size={14} />
      </motion.button>
    </div>
  );
}
