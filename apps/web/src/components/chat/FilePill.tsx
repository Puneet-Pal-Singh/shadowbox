import { FileText, X } from "lucide-react";
import { motion } from "framer-motion";

interface FilePillProps {
  filename: string;
  onRemove?: () => void;
  onClick?: () => void;
}

export function FilePill({ filename, onRemove, onClick }: FilePillProps) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-md hover:bg-blue-500/20 transition-colors group"
    >
      <FileText size={12} />
      <span className="truncate max-w-[150px]">{filename}</span>
      {onRemove && (
        <motion.span
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="opacity-0 group-hover:opacity-100 ml-0.5 hover:text-blue-300 transition-opacity"
        >
          <X size={12} />
        </motion.span>
      )}
    </motion.button>
  );
}
