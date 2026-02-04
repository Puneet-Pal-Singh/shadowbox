import { ChevronDown, Folder } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { cn } from "../../lib/utils";

interface ThreadItem {
  id: string;
  title: string;
  status: "running" | "completed" | "error";
  isActive?: boolean;
}

interface ThreadListProps {
  projectName: string;
  threads: ThreadItem[];
  onSelectThread: (id: string) => void;
  onRemoveThread?: (id: string) => void;
}

export function ThreadList({
  projectName,
  threads,
  onSelectThread,
  onRemoveThread,
}: ThreadListProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const runningThreads = threads.filter((t) => t.status === "running");
  const completedThreads = threads.filter(
    (t) => t.status === "completed" || t.status === "error",
  );
  const sortedThreads = [...runningThreads, ...completedThreads];

  return (
    <div className="mt-2">
      {/* Project Header */}
      <motion.button
        onClick={() => setIsExpanded(!isExpanded)}
        whileHover={{ scale: 1.01 }}
        className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:text-white w-full text-left transition-colors"
      >
        <ChevronDown
          size={16}
          className={cn(
            "text-zinc-500 transition-transform duration-200",
            !isExpanded && "-rotate-90",
          )}
        />
        <Folder size={16} className="text-zinc-500" />
        <span className="truncate">{projectName}</span>
      </motion.button>

      {/* Thread Items */}
      {isExpanded && (
        <div className="ml-4 mt-1 space-y-0.5">
          {sortedThreads.map((thread, idx) => (
            <ThreadItemComponent
              key={thread.id}
              thread={thread}
              onSelect={() => onSelectThread(thread.id)}
              onRemove={() => onRemoveThread?.(thread.id)}
              delay={idx * 0.03}
            />
          ))}
          {threads.length === 0 && (
            <p className="px-3 py-2 text-xs text-zinc-600 italic">No threads</p>
          )}
        </div>
      )}
    </div>
  );
}

interface ThreadItemComponentProps {
  thread: ThreadItem;
  onSelect: () => void;
  onRemove?: () => void;
  delay?: number;
}

function ThreadItemComponent({
  thread,
  onSelect,
  onRemove,
  delay = 0,
}: ThreadItemComponentProps) {
  const getStatusDot = () => {
    switch (thread.status) {
      case "running":
        return (
          <motion.div
            className="w-1.5 h-1.5 rounded-full bg-emerald-500"
            animate={{ scale: [1, 1.3, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        );
      case "completed":
        return <div className="w-1.5 h-1.5 rounded-full bg-zinc-500" />;
      case "error":
        return <div className="w-1.5 h-1.5 rounded-full bg-red-500" />;
      default:
        return <div className="w-1.5 h-1.5 rounded-full bg-zinc-600" />;
    }
  };

  return (
    <motion.button
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.2 }}
      onClick={onSelect}
      className={cn(
        "group flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-all w-full text-left",
        thread.isActive
          ? "text-white bg-zinc-800/60"
          : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40",
      )}
    >
      {getStatusDot()}
      <span className="truncate flex-1">{thread.title}</span>
      {onRemove && (
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-400 transition-opacity"
        >
          <span className="sr-only">Remove</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </motion.button>
      )}
    </motion.button>
  );
}
