import { useState, useRef, useEffect } from "react";
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
  Settings,
} from "lucide-react";
import {
  staggerContainer,
  staggerItem,
  slideUp,
  hoverScaleSmall,
} from "../../lib/animations";
import { useGitHub } from "../github/GitHubContextProvider";
import { ChatBranchSelector } from "../chat/ChatBranchSelector";
import { ModelSelector } from "../settings/ModelSelector";
import { ProviderSettings } from "../settings/ProviderSettings";

interface AgentSetupProps {
  sessionId: string;
  onStart: (config: { repo: string; branch: string; task: string }) => void;
  onRepoClick?: () => void;
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

export function AgentSetup({ sessionId, onStart, onRepoClick }: AgentSetupProps) {
  const { repo, branch } = useGitHub();
  const [task, setTask] = useState("");
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const [showProviderSettings, setShowProviderSettings] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const hasTask = task.trim().length > 0;

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const maxHeight = hasTask ? 200 : 400;
      const newHeight = Math.min(textareaRef.current.scrollHeight, maxHeight);
      textareaRef.current.style.height = newHeight + "px";
    }
  }, [task, hasTask]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (task.trim()) {
      onStart({
        repo: repo?.full_name || "",
        branch: branch || "main",
        task,
      });
    }
  };

  const handleSuggestedAction = (title: string) => {
    setTask(title);
  };

  const repoName = repo?.name || "New Project";

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
            className="w-10 h-10 mb-4 text-zinc-300"
            animate={{
              y: [0, -4, 0],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <Cloud size={40} strokeWidth={1.5} />
          </motion.div>

          {/* Title */}
          <h1 className="text-2xl font-medium text-white tracking-tight">
            Let's build
          </h1>

          {/* Project Name with Dropdown */}
          <motion.button
            onClick={onRepoClick}
            className="flex items-center gap-1.5 mt-0.5 text-2xl font-medium text-zinc-500 hover:text-zinc-400 transition-colors duration-200 group"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <span>{repoName}</span>
            <ChevronDown
              size={18}
              className="text-zinc-600 group-hover:text-zinc-500 transition-colors duration-200"
            />
          </motion.button>
        </motion.div>

        {/* Suggestion Cards - Hidden when typing */}
        <motion.div
          className={`flex gap-2 w-full max-w-3xl mb-6 ${task.trim() ? "hidden" : ""}`}
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
                  flex-1 flex flex-col gap-2 p-3 
                  bg-[#171717] border rounded-lg text-left 
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
                    w-6 h-6 flex items-center justify-center rounded-md 
                    bg-zinc-800/50 text-zinc-400 
                    group-hover:text-zinc-300 group-hover:bg-zinc-800 
                    transition-all duration-200
                  `}
                  >
                    <Icon size={14} />
                  </div>
                  <p className="text-xs text-zinc-200 leading-snug mt-2 group-hover:text-white transition-colors duration-200">
                    {action.title}
                  </p>
                </div>
              </motion.button>
            );
          })}
        </motion.div>
      </div>

      {/* Input Area - Bottom */}
      <div className="w-full px-6 pb-4">
        <motion.div
          className="max-w-4xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
        >
          <form onSubmit={handleSubmit} className="px-4 pb-3">
            <motion.div
              className={`
                bg-[#171717] rounded-xl p-3
                transition-all duration-200
                ${isInputFocused ? "shadow-lg shadow-black/20" : ""}
              `}
              animate={{
                boxShadow: isInputFocused
                  ? "0 4px 20px rgba(0, 0, 0, 0.3)"
                  : "0 0 0 0px rgba(0, 0, 0, 0)",
              }}
            >
              <textarea
                ref={textareaRef}
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
                className={`w-full bg-transparent text-sm text-white placeholder-zinc-500 focus:outline-none resize-none overflow-hidden min-h-[20px] ${hasTask ? "max-h-[200px]" : "max-h-[400px]"}`}
                style={{ lineHeight: "1.5" }}
              />

              {/* Toolbar */}
              <div className="flex items-center justify-between mt-2 pt-2">
                {/* Left: Add button + Model selector + Settings */}
                <div className="flex items-center gap-1.5">
                  <motion.button
                    type="button"
                    {...hoverScaleSmall}
                    className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors duration-150"
                    title="Add files"
                  >
                    <Plus size={16} />
                  </motion.button>

                  <div className="h-3.5 w-px bg-zinc-800" />

                  <motion.button
                    type="button"
                    onClick={() => setShowProviderSettings(!showProviderSettings)}
                    whileHover={{ scale: 1.02 }}
                    className="flex items-center gap-1 px-1.5 py-0.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors duration-150"
                    title="Configure provider and model"
                  >
                    <span className="font-medium">
                      {selectedModel || "Select Model"}
                    </span>
                    <ChevronDown size={12} />
                  </motion.button>

                  <motion.button
                    type="button"
                    onClick={() => setShowProviderSettings(!showProviderSettings)}
                    {...hoverScaleSmall}
                    className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors duration-150"
                    title="Provider settings"
                  >
                    <Settings size={16} />
                  </motion.button>
                </div>

                {/* Right: Attachment, Mic, Send */}
                <div className="flex items-center gap-1.5">
                  <motion.button
                    type="button"
                    {...hoverScaleSmall}
                    className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors duration-150"
                    title="Attach file"
                  >
                    <Paperclip size={16} />
                  </motion.button>

                  <motion.button
                    type="button"
                    {...hoverScaleSmall}
                    className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors duration-150"
                    title="Voice input"
                  >
                    <Mic size={16} />
                  </motion.button>

                  <motion.button
                    type="submit"
                    disabled={!task.trim()}
                    whileHover={{ scale: task.trim() ? 1.05 : 1 }}
                    whileTap={{ scale: task.trim() ? 0.95 : 1 }}
                    className={`
                      p-1.5 rounded-full transition-all duration-200
                      ${
                        task.trim()
                          ? "bg-white text-black hover:bg-zinc-100 shadow-lg shadow-white/10"
                          : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                      }
                    `}
                  >
                    <ArrowUp size={16} />
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </form>
          <div className="pl-6 mt-1">
            <ChatBranchSelector />
          </div>
        </motion.div>
      </div>

      {/* Provider Settings Modal */}
      {showProviderSettings && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/50 flex items-center justify-center z-50 rounded-lg"
          onClick={() => setShowProviderSettings(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md mx-4 space-y-4"
          >
            {/* ProviderSettings Component */}
            <div className="bg-zinc-950 rounded-lg border border-zinc-800">
              <ProviderSettings
                onProviderConnect={(providerId) => {
                  console.log("[AgentSetup] Provider connected:", providerId);
                }}
              />
            </div>

            {/* ModelSelector Component */}
            <div className="bg-zinc-950 rounded-lg border border-zinc-800">
              <ModelSelector
                sessionId={sessionId}
                onModelSelect={(providerId, modelId) => {
                  setSelectedModel(modelId);
                  console.log(
                    "[AgentSetup] Model selected:",
                    providerId,
                    modelId,
                  );
                }}
              />
            </div>

            {/* Close button */}
            <div className="flex justify-end">
              <motion.button
                onClick={() => setShowProviderSettings(false)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium rounded transition-colors"
              >
                Close
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
}
