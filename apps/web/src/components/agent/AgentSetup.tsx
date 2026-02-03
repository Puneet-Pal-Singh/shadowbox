import { useState } from "react";
import { motion } from "framer-motion";
import {
  Terminal,
  ArrowUp,
  GitPullRequest,
  FileText,
  Gamepad2,
} from "lucide-react";

interface AgentSetupProps {
  onStart: (config: { repo: string; branch: string; task: string }) => void;
}

interface SuggestedAction {
  icon: React.ReactNode;
  label: string;
  description: string;
}

const SUGGESTED_ACTIONS: SuggestedAction[] = [
  {
    icon: <Gamepad2 size={20} className="text-zinc-400" />,
    label: "Build a classic Snake game",
    description: "Create an interactive browser game in this repo",
  },
  {
    icon: <FileText size={20} className="text-zinc-400" />,
    label: "Create a one-page PDF summary",
    description: "Generate a document that summarizes this app",
  },
  {
    icon: <GitPullRequest size={20} className="text-zinc-400" />,
    label: "Summarize recent PRs",
    description: "Get last week's changes by teammate and theme",
  },
];

export function AgentSetup({ onStart }: AgentSetupProps) {
  const [task, setTask] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (task.trim()) {
      onStart({ repo: "", branch: "main", task });
    }
  };

  const handleSuggestedAction = (action: string) => {
    setTask(action);
  };

  return (
    <motion.div
      className="flex-1 flex flex-col items-center justify-center p-6 bg-black relative overflow-hidden"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Gradient Background */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-full pointer-events-none">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-emerald-500/5 blur-[120px] rounded-full opacity-50" />
      </div>

      {/* Single Screen - Command Bar */}
      <motion.div
        key="command-bar"
        className="relative w-full flex flex-col items-center gap-12"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        {/* Header */}
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-14 h-14 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-center shadow-2xl shadow-emerald-500/5">
            <Terminal size={28} className="text-emerald-500" />
          </div>
          <h1 className="text-4xl font-bold text-white tracking-tight">
            Shadowbox
          </h1>
          <p className="text-zinc-400 text-base">AI Agent Workspace</p>
        </div>

        {/* Command Bar (Centered) */}
        <motion.form
          onSubmit={handleSubmit}
          className="w-full max-w-[600px]"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.4 }}
        >
          <div className="relative">
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e as any);
                }
              }}
              placeholder="Ask Shadowbox to build, fix, explore..."
              rows={1}
              className="w-full bg-zinc-950/50 border border-zinc-800 rounded-2xl py-4 px-5 text-base text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 transition-all shadow-2xl backdrop-blur-sm resize-none overflow-hidden min-h-[56px] max-h-[200px] font-mono"
              style={{ lineHeight: "1.5" }}
            />
            <motion.button
              type="submit"
              disabled={!task.trim()}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowUp size={20} className="text-zinc-500" />
            </motion.button>
          </div>
        </motion.form>

        {/* Suggested Actions - Card Style */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-3xl px-4"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          {SUGGESTED_ACTIONS.map((action, idx) => (
            <motion.button
              key={action.label}
              type="button"
              onClick={() => handleSuggestedAction(action.label)}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              className="flex flex-col items-start gap-3 p-5 bg-zinc-900/50 border border-zinc-800 rounded-xl text-left hover:border-zinc-600 hover:bg-zinc-800/50 transition-all group"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + idx * 0.05 }}
            >
              <div className="p-2 bg-zinc-800/50 rounded-lg group-hover:bg-zinc-700/50 transition-colors">
                {action.icon}
              </div>
              <div>
                <div className="text-sm font-medium text-zinc-200 mb-1">
                  {action.label}
                </div>
                <div className="text-xs text-zinc-500">
                  {action.description}
                </div>
              </div>
            </motion.button>
          ))}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
