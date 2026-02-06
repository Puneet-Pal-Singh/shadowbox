import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Maximize2 } from "lucide-react";
import { FileExplorer, FileExplorerHandle } from "../FileExplorer";
import { ChatInterface } from "../chat/ChatInterface";
import { ChangesPanel } from "../sidebar/ChangesPanel";
import { RunContextProvider } from "../../hooks/useRunContext";
import { useChat } from "../../hooks/useChat";
import { cn } from "../../lib/utils";
import { useGitStatus } from "../../hooks/useGitStatus";

interface WorkspaceProps {
  sessionId: string;
  threadTitle?: string;
  isRightSidebarOpen?: boolean;
  onRightSidebarClose?: () => void;
}

export function Workspace({ 
  sessionId: runId, 
  threadTitle,
  isRightSidebarOpen = false,
  onRightSidebarClose,
}: WorkspaceProps) {
  const explorerRef = useRef<FileExplorerHandle>(null);
  const sandboxId = runId;
  
  // Sidebar tab state
  const [activeTab, setActiveTab] = useState<"files" | "changes">("files");
  
  const { status } = useGitStatus(); // To show badge count
  const changesCount = status?.files.length || 0;

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    isHydrating,
  } = useChat(sandboxId, runId, () => {
    explorerRef.current?.refresh();
  });

  const handleFileClick = async (path: string) => {
    console.log("Clicked file:", path);
  };

  if (isHydrating) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">
            Hydrating History...
          </span>
        </div>
      </div>
    );
  }

  return (
    <RunContextProvider runId={runId}>
      <div className="flex-1 flex bg-black overflow-hidden relative">
        {/* Chat Area */}
        <main className="flex-1 flex flex-col min-w-0 bg-black relative">
          <ChatInterface
            chatProps={{
              messages,
              input,
              handleInputChange,
              handleSubmit,
              isLoading,
            }}
            threadTitle={threadTitle}
            onArtifactOpen={() => {}}
          />
        </main>

        {/* Combined Sidebar */}
        <motion.aside
          animate={{
            width: isRightSidebarOpen ? 320 : 0,
          }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className={cn(
            "border-l border-zinc-800 bg-black flex flex-col overflow-hidden shrink-0",
            !isRightSidebarOpen && "border-transparent",
          )}
        >
          <div className="flex-1 flex flex-col min-w-[320px] w-[320px]">
            {/* Sidebar Header */}
            <div className="h-10 border-b border-zinc-800 flex items-center justify-between px-3 bg-black">
              <div className="flex gap-4 h-full">
                <button
                  onClick={() => setActiveTab("files")}
                  className={cn(
                    "text-xs font-semibold uppercase tracking-wide transition-colors relative h-full flex items-center",
                    activeTab === "files" ? "text-white" : "text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  Files
                  {activeTab === "files" && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-400"
                    />
                  )}
                </button>
                <button
                  onClick={() => setActiveTab("changes")}
                  className={cn(
                    "text-xs font-semibold uppercase tracking-wide transition-colors relative h-full flex items-center gap-1.5",
                    activeTab === "changes" ? "text-white" : "text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  Changes
                  {changesCount > 0 && (
                    <span className="px-1.5 py-0.5 bg-zinc-800 text-zinc-300 text-[10px] rounded-full">
                      {changesCount}
                    </span>
                  )}
                  {activeTab === "changes" && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-400"
                    />
                  )}
                </button>
              </div>
              
              {/* Optional Expand Button */}
              <button 
                className="text-zinc-500 hover:text-zinc-300 p-1 rounded hover:bg-zinc-900"
                title="Expand to full screen (Coming Soon)"
              >
                <Maximize2 size={14} />
              </button>
            </div>

            {/* Sidebar Content */}
            <div className="flex-1 overflow-hidden relative">
              <AnimatePresence mode="wait" initial={false}>
                {activeTab === "files" ? (
                  <motion.div
                    key="files"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.15 }}
                    className="absolute inset-0 overflow-y-auto"
                  >
                    <FileExplorer
                      ref={explorerRef}
                      sessionId={sandboxId}
                      runId={runId}
                      onFileClick={handleFileClick}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="changes"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.15 }}
                    className="absolute inset-0 overflow-hidden"
                  >
                    <ChangesPanel mode="sidebar" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.aside>
      </div>
    </RunContextProvider>
  );
}