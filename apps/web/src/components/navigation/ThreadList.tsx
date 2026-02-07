import { ChevronDown, Folder, Plus, MoreHorizontal, Trash2, Edit2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect } from "react";
import { cn } from "../../lib/utils";

interface TaskItem {
  id: string;
  title: string;
  status: "running" | "completed" | "error" | "idle";
  isActive?: boolean;
}

interface RepositorySectionProps {
  repositoryName: string;
  tasks: TaskItem[];
  onSelectTask: (id: string) => void;
  onRemoveTask?: (id: string) => void;
  onAddTask?: () => void;
  onRemoveRepo?: () => void;
  onRenameRepo?: (newName: string) => void;
}

export function RepositorySection({
  repositoryName,
  tasks,
  onSelectTask,
  onRemoveTask,
  onAddTask,
  onRemoveRepo,
  onRenameRepo,
}: RepositorySectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(repositoryName);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleRename = () => {
    if (newName.trim() && newName !== repositoryName) {
      onRenameRepo?.(newName);
    }
    setIsRenaming(false);
    setShowMenu(false);
  };

  const runningTasks = tasks.filter((t) => t.status === "running");
  const idleTasks = tasks.filter((t) => t.status === "idle");
  const completedTasks = tasks.filter(
    (t) => t.status === "completed" || t.status === "error",
  );
  const sortedTasks = [...runningTasks, ...idleTasks, ...completedTasks];

  return (
    <div className="mt-2 group/repo">
      {/* Repository Header */}
      <div className="flex items-center gap-1 px-1 pr-2 hover:bg-zinc-800/40 rounded-md transition-colors">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 p-1 py-2 text-sm text-zinc-300 hover:text-white flex-1 text-left truncate transition-colors"
        >
          <ChevronDown
            size={14}
            className={cn(
              "text-zinc-500 transition-transform duration-200 shrink-0",
              !isExpanded && "-rotate-90",
            )}
          />
          <Folder size={14} className="text-zinc-500 shrink-0" />
          {isRenaming ? (
            <input
              autoFocus
              className="bg-zinc-900 text-white px-1 rounded outline-none w-full text-xs py-0.5 border border-zinc-700"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename();
                if (e.key === "Escape") {
                  setIsRenaming(false);
                  setNewName(repositoryName);
                }
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="truncate font-medium">{repositoryName}</span>
          )}
        </button>

        {/* Action Buttons */}
        <div className="flex items-center opacity-0 group-hover/repo:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddTask?.();
            }}
            className="p-1 text-zinc-500 hover:text-emerald-400 transition-colors"
            title="New Task"
          >
            <Plus size={14} />
          </button>
          
          <div className="relative" ref={menuRef}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="p-1 text-zinc-500 hover:text-white transition-colors"
              title="More options"
            >
              <MoreHorizontal size={14} />
            </button>
            
            <AnimatePresence>
              {showMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  className="absolute right-0 mt-1 w-40 bg-[#171717] border border-zinc-800 rounded-lg shadow-xl z-50 py-1 overflow-hidden"
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsRenaming(true);
                      setShowMenu(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                  >
                    <Edit2 size={12} />
                    Rename Folder
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Remove repository folder "${repositoryName}"?`)) {
                        onRemoveRepo?.();
                      }
                      setShowMenu(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/20 transition-colors"
                  >
                    <Trash2 size={12} />
                    Remove Repo Folder
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Task Items directly under repo */}
      {isExpanded && (
        <div className="ml-4 mt-1 space-y-0.5 border-l border-zinc-800/50 pl-2">
          {sortedTasks.map((task, idx) => (
            <TaskItemComponent
              key={task.id}
              task={task}
              onSelect={() => onSelectTask(task.id)}
              onRemove={() => {
                if (confirm(`Are you sure you want to delete task "${task.title}"?`)) {
                  onRemoveTask?.(task.id);
                }
              }}
              delay={idx * 0.03}
            />
          ))}
          {tasks.length === 0 && (
            <div className="px-3 py-2 flex flex-col items-center justify-center border border-dashed border-zinc-800/50 rounded-md mx-2 my-1">
              <p className="text-[10px] text-zinc-600 italic">No tasks</p>
              <button 
                onClick={onAddTask}
                className="mt-1 text-[9px] text-emerald-500/70 hover:text-emerald-400 underline underline-offset-2 transition-colors"
              >
                Create one?
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface TaskItemComponentProps {
  task: TaskItem;
  onSelect: () => void;
  onRemove?: () => void;
  delay?: number;
}

function TaskItemComponent({
  task,
  onSelect,
  onRemove,
  delay = 0,
}: TaskItemComponentProps) {
  const getStatusDot = () => {
    switch (task.status) {
      case "running":
        return (
          <motion.div
            className="w-1.5 h-1.5 rounded-full bg-emerald-500"
            animate={{ scale: [1, 1.3, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        );
      case "idle":
        return <div className="w-1.5 h-1.5 rounded-full bg-amber-500/50" />;
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
        "group flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-all w-full text-left",
        task.isActive
          ? "text-white bg-zinc-800/60"
          : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40",
      )}
    >
      {getStatusDot()}
      <span className="truncate flex-1">{task.title}</span>
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
