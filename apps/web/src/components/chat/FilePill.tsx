import { FileText, X } from "lucide-react";
import { motion } from "framer-motion";

interface FilePillProps {
  filename: string;
  onRemove?: () => void;
  onClick?: () => void;
}

export function FilePill({ filename, onRemove, onClick }: FilePillProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="group inline-flex items-center gap-1.5 rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-1 text-xs font-medium text-blue-400 transition-colors hover:bg-blue-500/20"
    >
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1.5"
      >
        <FileText size={12} />
        <span className="truncate max-w-[150px]">{filename}</span>
      </button>
      {onRemove && (
        <motion.button
          type="button"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove ${filename}`}
          title={`Remove ${filename}`}
          className="opacity-0 group-hover:opacity-100 ml-0.5 hover:text-blue-300 transition-opacity"
        >
          <X size={12} />
        </motion.button>
      )}
    </motion.div>
  );
}
