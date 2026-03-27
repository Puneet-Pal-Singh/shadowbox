import { ChevronDown, GitBranch } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";

interface CommitDropdownProps {
  onCommit?: () => void;
  onPush?: () => void;
  onStash?: () => void;
}

interface CommitDropdownAction {
  id: string;
  label: string;
  action: () => void;
}

export function CommitDropdown({
  onCommit,
  onPush,
  onStash,
}: CommitDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const actions: CommitDropdownAction[] = [
    onCommit
      ? { id: "commit", label: "Commit changes", action: onCommit }
      : null,
    onPush
      ? { id: "push", label: "Push to remote", action: onPush }
      : null,
    onStash
      ? { id: "stash", label: "Stash changes", action: onStash }
      : null,
  ].filter((action): action is CommitDropdownAction => action !== null);
  const disabled = actions.length === 0;

  const handleAction = (action: () => void) => {
    setIsOpen(false);
    action();
  };

  return (
    <div className="relative">
      <motion.button
        onClick={() => {
          if (!disabled) {
            setIsOpen(!isOpen);
          }
        }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        disabled={disabled}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-zinc-300 hover:text-white bg-zinc-900/50 hover:bg-zinc-800/50 border border-zinc-800 rounded-md transition-all disabled:cursor-not-allowed disabled:text-zinc-600 disabled:hover:bg-zinc-900/50 disabled:hover:text-zinc-600"
        title={disabled ? "Git review actions are not available yet" : "Git review actions"}
      >
        <GitBranch size={14} className="text-emerald-400" />
        <span>Commit</span>
        <ChevronDown
          size={12}
          className={`text-zinc-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </motion.button>

      {isOpen && !disabled && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full right-0 mt-1 w-36 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl z-50 overflow-hidden"
          >
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => handleAction(action.action)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800/50 text-left transition-colors"
              >
                <span>{action.label}</span>
              </button>
            ))}
          </motion.div>
        </>
      )}
    </div>
  );
}
