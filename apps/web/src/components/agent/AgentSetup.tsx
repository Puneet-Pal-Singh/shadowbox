import { useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronDown,
  Cloud,
  Gamepad2,
  FileText,
  GitPullRequest,
  Plus,
  Mic,
  ArrowUp,
  Paperclip,
} from "lucide-react";
import {
  staggerContainer,
  staggerItem,
  slideUp,
  hoverScaleSmall,
} from "../../lib/animations";

interface AgentSetupProps {
  onStart: (config: { repo: string; branch: string; task: string }) => void;
}

interface SuggestedAction {
  icon: React.ElementType;
  title: string;
  gradient: string;
}

const SUGGESTED_ACTIONS: SuggestedAction[] = [
  {
    icon: Gamepad2,
    title: "Build a classic Snake game in this repo.",
    gradient: "from-blue-500/10 to-purple-500/10",
  },
  {
    icon: FileText,
    title: "Create a one-page $pdf that summarizes this app.",
    gradient: "from-emerald-500/10 to-teal-500/10",
  },
  {
    icon: GitPullRequest,
    title: "Summarize last week's PRs by teammate and theme.",
    gradient: "from-orange-500/10 to-red-500/10",
  },
];

export function AgentSetup({ onStart }: AgentSetupProps) {
  const [task, setTask] = useState("");
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (task.trim()) {
      onStart({ repo: "", branch: "main", task });
    }
  };

  const handleSuggestedAction = (title: string) => {
    setTask(title);
  };

  return (
    <motion.div
      className="flex-1 flex flex-col bg-black relative overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Animated Background Glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-emerald-500/5 blur-[150px] rounded-full"
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>

      {/* Main Content - Centered */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {/* Logo and Title */}
        <motion.div
          className="flex flex-col items-center mb-12"
          variants={slideUp}
          initial="initial"
          animate="animate"
        >
          {/* Cloud/Brain Icon */}
          <motion.div
            className="w-12 h-12 mb-6 text-zinc-300"
            animate={{
              y: [0, -5, 0],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <Cloud size={48} strokeWidth={1.5} />
          </motion.div>

          {/* Title */}
          <h1 className="text-3xl font-medium text-white tracking-tight">
            Let's build
          </h1>

          {/* Project Name with Dropdown */}
          <motion.button
            className="flex items-center gap-1.5 mt-1 text-3xl font-medium text-zinc-500 hover:text-zinc-400 transition-colors duration-200 group"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <span>shadowbox</span>
            <ChevronDown
              size={20}
              className="text-zinc-600 group-hover:text-zinc-500 transition-colors duration-200"
            />
          </motion.button>
        </motion.div>

        {/* Suggestion Cards */}
        <motion.div
          className="flex gap-3 w-full max-w-3xl mb-8"
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          {SUGGESTED_ACTIONS.map((action, idx) => {
            const Icon = action.icon;
            const isHovered = hoveredCard === idx;

            return (
              <motion.button
                key={idx}
                type="button"
                variants={staggerItem}
                onClick={() => handleSuggestedAction(action.title)}
                onMouseEnter={() => setHoveredCard(idx)}
                onMouseLeave={() => setHoveredCard(null)}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                className={`
                  flex-1 flex flex-col gap-3 p-4 
                  bg-[#171717] border rounded-xl text-left 
                  transition-all duration-200 group relative overflow-hidden
                  ${isHovered ? "border-[#404040]" : "border-[#262626]"}
                `}
              >
                {/* Gradient overlay on hover */}
                <motion.div
                  className={`absolute inset-0 bg-gradient-to-br ${action.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}
                  initial={false}
                  animate={{ opacity: isHovered ? 0.5 : 0 }}
                />

                <div className="relative z-10">
                  <div
                    className={`
                    w-8 h-8 flex items-center justify-center rounded-lg 
                    bg-zinc-800/50 text-zinc-400 
                    group-hover:text-zinc-300 group-hover:bg-zinc-800 
                    transition-all duration-200
                  `}
                  >
                    <Icon size={18} />
                  </div>
                  <p className="text-sm text-zinc-200 leading-snug mt-3 group-hover:text-white transition-colors duration-200">
                    {action.title}
                  </p>
                </div>
              </motion.button>
            );
          })}
        </motion.div>
      </div>

      {/* Input Area - Bottom */}
      <motion.div
        className="w-full max-w-2xl mx-auto px-6 pb-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.4 }}
      >
        <form onSubmit={handleSubmit}>
          <motion.div
            className={`
              bg-[#171717] border rounded-2xl p-4
              transition-all duration-200
              ${isInputFocused ? "border-[#525252] shadow-lg shadow-black/20" : "border-[#262626]"}
            `}
            animate={{
              boxShadow: isInputFocused
                ? "0 0 0 1px rgba(82, 82, 82, 0.5), 0 4px 20px rgba(0, 0, 0, 0.3)"
                : "0 0 0 0px rgba(82, 82, 82, 0)",
            }}
          >
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e as unknown as React.FormEvent);
                }
              }}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
              placeholder="Ask Shadowbox anything, @ to add files, / for commands"
              rows={1}
              className="w-full bg-transparent text-base text-white placeholder-zinc-500 focus:outline-none resize-none overflow-hidden min-h-[24px] max-h-[200px]"
              style={{ lineHeight: "1.5" }}
            />

            {/* Toolbar */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#262626]">
              {/* Left: Add button + Model selector */}
              <div className="flex items-center gap-2">
                <motion.button
                  type="button"
                  {...hoverScaleSmall}
                  className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors duration-150"
                  title="Add files"
                >
                  <Plus size={18} />
                </motion.button>

                <div className="h-4 w-px bg-zinc-800" />

                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  className="flex items-center gap-1.5 px-2 py-1 text-sm text-zinc-500 hover:text-zinc-300 transition-colors duration-150"
                >
                  <span className="font-medium">GPT-5.2-Codex</span>
                  <span className="text-zinc-600">Medium</span>
                  <ChevronDown size={14} />
                </motion.button>
              </div>

              {/* Right: Attachment, Mic, Send */}
              <div className="flex items-center gap-2">
                <motion.button
                  type="button"
                  {...hoverScaleSmall}
                  className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors duration-150"
                  title="Attach file"
                >
                  <Paperclip size={18} />
                </motion.button>

                <motion.button
                  type="button"
                  {...hoverScaleSmall}
                  className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors duration-150"
                  title="Voice input"
                >
                  <Mic size={18} />
                </motion.button>

                <motion.button
                  type="submit"
                  disabled={!task.trim()}
                  whileHover={{ scale: task.trim() ? 1.05 : 1 }}
                  whileTap={{ scale: task.trim() ? 0.95 : 1 }}
                  className={`
                    p-2 rounded-full transition-all duration-200
                    ${
                      task.trim()
                        ? "bg-white text-black hover:bg-zinc-100 shadow-lg shadow-white/10"
                        : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                    }
                  `}
                >
                  <ArrowUp size={18} />
                </motion.button>
              </div>
            </div>
          </motion.div>
        </form>
      </motion.div>
    </motion.div>
  );
}
