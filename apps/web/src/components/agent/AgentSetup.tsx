import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Github, GitBranch, Play, ArrowUp } from 'lucide-react';

interface AgentSetupProps {
  onStart: (config: { repo: string; branch: string; task: string }) => void;
}

interface SuggestedAction {
  label: string;
  description: string;
}

const SUGGESTED_ACTIONS: SuggestedAction[] = [
  { label: 'Run security audit', description: 'Scan for vulnerabilities' },
  { label: 'Fix @components', description: 'Resolve component issues' },
  { label: 'Improve AGENTS.md', description: 'Update documentation' },
];

export function AgentSetup({ onStart }: AgentSetupProps) {
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("main");
  const [task, setTask] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (task.trim()) {
      onStart({ repo, branch, task });
    }
  };

  const handleSuggestedAction = (action: string) => {
    setTask(action);
    setIsExpanded(true);
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

      {/* Zero-State Content */}
      <AnimatePresence mode="wait">
        {!isExpanded ? (
          <motion.div
            key="zero-state"
            className="relative w-full flex flex-col items-center gap-12"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
          >
            {/* Header */}
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-14 h-14 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-center shadow-2xl shadow-emerald-500/5">
                <Terminal size={28} className="text-emerald-500" />
              </div>
              <h1 className="text-4xl font-bold text-white tracking-tight">Shadowbox</h1>
              <p className="text-zinc-400 text-base">AI Agent Workspace</p>
            </div>

            {/* Command Bar (Centered) */}
            <motion.div
              className="w-full max-w-[600px]"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.4 }}
            >
              <div className="relative">
                <input
                  type="text"
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  onFocus={() => setIsExpanded(true)}
                  placeholder="Ask Shadowbox to build, fix, explore..."
                  className="w-full bg-zinc-950/50 border border-zinc-800 rounded-2xl py-4 px-5 text-base text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 transition-all shadow-2xl backdrop-blur-sm"
                />
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  <ArrowUp size={20} className="text-zinc-500" />
                </motion.button>
              </div>
            </motion.div>

            {/* Suggested Actions */}
            <motion.div
              className="flex gap-3 flex-wrap justify-center max-w-xl"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.4 }}
            >
              {SUGGESTED_ACTIONS.map((action, idx) => (
                <motion.button
                  key={action.label}
                  onClick={() => handleSuggestedAction(action.label)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="px-4 py-2 bg-zinc-900/50 border border-zinc-800 rounded-lg text-xs text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800/50 transition-all"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + idx * 0.05 }}
                >
                  {action.label}
                </motion.button>
              ))}
            </motion.div>
          </motion.div>
        ) : (
          /* Expanded Form */
          <motion.div
            key="expanded-form"
            className="relative w-full max-w-xl flex flex-col gap-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.3 }}
          >
            <button
              onClick={() => setIsExpanded(false)}
              className="text-zinc-500 hover:text-zinc-400 text-sm mb-2 transition-colors"
            >
              ← Back
            </button>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-1">Repository (Optional)</label>
                  <div className="relative">
                    <Github size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
                    <input 
                      value={repo}
                      onChange={(e) => setRepo(e.target.value)}
                      placeholder="owner/repo"
                      className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder-zinc-700 focus:outline-none focus:border-emerald-500/50 transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-1">Base Branch</label>
                  <div className="relative">
                    <GitBranch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
                    <input 
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      placeholder="main"
                      className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder-zinc-700 focus:outline-none focus:border-emerald-500/50 transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-1">Task Description</label>
                <textarea 
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  placeholder="Describe what you want the agent to do..."
                  rows={4}
                  className="w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl py-4 px-5 text-sm text-white placeholder-zinc-700 focus:outline-none focus:border-emerald-500/50 transition-all resize-none shadow-2xl"
                />
              </div>

              <motion.button 
                type="submit"
                disabled={!task.trim()}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full bg-white text-black font-bold py-3 rounded-xl hover:bg-zinc-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                <Play size={16} className="fill-current group-hover:scale-110 transition-transform" />
                Launch Agent
              </motion.button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
