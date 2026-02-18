import { useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { FileExplorerHandle } from "../FileExplorer";
import { ChatInterface } from "../chat/ChatInterface";
import { RunContextProvider } from "../../hooks/useRunContext";
import { useChat } from "../../hooks/useChat";
import { cn } from "../../lib/utils";
import { useGitStatus } from "../../hooks/useGitStatus";
import { useGitDiff } from "../../hooks/useGitDiff";
import { Resizer } from "../ui/Resizer";
import { useWorkspaceState } from "./workspace/useWorkspaceState";
import { useGitHubTree } from "./workspace/useGitHubTree";
import { useFileLoader } from "./workspace/useFileLoader";
import { SidebarHeader } from "./workspace/SidebarHeader";
import { SidebarContent } from "./workspace/SidebarContent";

interface WorkspaceProps {
  sessionId: string;
  runId: string;
  repository: string;
  isRightSidebarOpen?: boolean;
  setIsRightSidebarOpen?: (open: boolean) => void;
}

export function Workspace({
  sessionId,
  runId: initialRunId,
  repository,
  isRightSidebarOpen = false,
  setIsRightSidebarOpen,
}: WorkspaceProps) {
  const explorerRef = useRef<FileExplorerHandle>(null);
  const sandboxId = sessionId;

  // Custom Hooks
  const {
    activeTab,
    setActiveTab,
    sidebarWidth,
    setSidebarWidth,
    isResizing,
    setIsResizing,
    selectedFile,
    setSelectedFile,
    selectedDiff,
    setSelectedDiff,
    isViewingContent,
    setIsViewingContent,
    isLoadingContent,
    setIsLoadingContent,
  } = useWorkspaceState();

  const { repoTree, isLoadingTree, repo, branch, isGitHubLoaded } =
    useGitHubTree(repository);

  const { status } = useGitStatus();
  const { fetch: fetchDiff, diff } = useGitDiff();
  const changesCount = status?.files.length || 0;

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    isHydrating,
    runId: activeRunId,
  } = useChat(sessionId, initialRunId, () => {
    explorerRef.current?.refresh();
  });

  const { handleFileClick, handleGitHubFileSelect } = useFileLoader({
    sandboxId,
    runId: activeRunId,
    setIsLoadingContent,
    setIsViewingContent,
    setSelectedFile,
  });

  useEffect(() => {
    // Persist runId to localStorage scoped by sessionId for cross-tab/refreshes persistence
    if (sessionId && activeRunId) {
      localStorage.setItem(`shadowbox_runId:${sessionId}`, activeRunId);
    }
  }, [sessionId, activeRunId]);

  useEffect(() => {
    explorerRef.current?.refresh();
  }, [activeRunId]);

  // Sync diff from hook to local state when it loads
  useEffect(() => {
    if (diff && activeTab === "changes") {
      setSelectedDiff({ path: diff.newPath, content: diff });
      setIsViewingContent(true);
    }
  }, [diff, activeTab, setSelectedDiff, setIsViewingContent]);

  // Restore selected file on mount if we were viewing one
  useEffect(() => {
    if (isHydrating) return;

    const savedPath = localStorage.getItem("shadowbox_last_viewed_path");
    console.log(
      `🧬 [Shadowbox] Restoration Check: isViewing=${isViewingContent}, path=${savedPath}, selectedFile=${!!selectedFile}`,
    );

    if (isViewingContent && savedPath && !selectedFile && !selectedDiff) {
      console.log(`🧬 [Shadowbox] Restoring last viewed file: ${savedPath}`);
      handleFileClick(savedPath);
    }
  }, [
    isHydrating,
    isViewingContent,
    selectedFile,
    selectedDiff,
    handleFileClick,
  ]);

  const handleViewChange = (path: string) => {
    fetchDiff(path);
    // Diff view will be set by the useEffect above
  };

  return (
    <RunContextProvider runId={activeRunId}>
      <div className="flex-1 flex bg-black overflow-hidden relative">
        {/* Chat Area */}
        <main className="flex-1 flex flex-col min-w-0 bg-black relative">
          {isHydrating ? (
            <div className="flex-1 flex items-center justify-center bg-background">
              <div className="flex flex-col items-center gap-4">
                <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">
                  Hydrating History...
                </span>
              </div>
            </div>
          ) : (
            <ChatInterface
              chatProps={{
                messages,
                input,
                handleInputChange,
                handleSubmit,
                isLoading,
              }}
              sessionId={sessionId}
              onArtifactOpen={(path, content) => {
                setSelectedFile({ path, content });
                setIsViewingContent(true);
                setIsRightSidebarOpen?.(true);
                setActiveTab("files");
              }}
            />
          )}
        </main>

        {/* Combined Sidebar */}
        <motion.aside
          initial={false}
          animate={{
            width: isRightSidebarOpen ? sidebarWidth : 0,
          }}
          transition={
            isResizing
              ? { duration: 0 }
              : { duration: 0.15, ease: [0.23, 1, 0.32, 1] }
          }
          className={cn(
            "border-l border-zinc-800 bg-black flex flex-col overflow-hidden shrink-0 relative",
            !isRightSidebarOpen && "border-transparent",
          )}
        >
          {isRightSidebarOpen && (
            <Resizer
              side="right"
              onResizeStart={() => setIsResizing(true)}
              onResizeEnd={() => setIsResizing(false)}
              onResize={(delta) =>
                setSidebarWidth((prev) =>
                  Math.max(280, Math.min(600, prev + delta)),
                )
              }
            />
          )}

          <div
            className="flex-1 flex flex-col min-w-[280px]"
            style={{ width: sidebarWidth }}
          >
            <SidebarHeader
              isViewingContent={isViewingContent}
              activeTab={activeTab}
              changesCount={changesCount}
              onBack={() => {
                setIsViewingContent(false);
                setSelectedFile(null);
                setSelectedDiff(null);
              }}
              onTabChange={setActiveTab}
            />

            <SidebarContent
              isViewingContent={isViewingContent}
              activeTab={activeTab}
              isLoadingContent={isLoadingContent}
              selectedFile={selectedFile}
              selectedDiff={selectedDiff}
              onCloseContent={() => setIsViewingContent(false)}
              repo={repo}
              isGitHubLoaded={isGitHubLoaded}
              repoTree={repoTree}
              isLoadingTree={!!isLoadingTree}
              branch={branch}
              handleGitHubFileSelect={handleGitHubFileSelect}
              handleFileClick={handleFileClick}
              handleViewChange={handleViewChange}
              explorerRef={explorerRef}
              sandboxId={sandboxId}
              runId={activeRunId}
            />
          </div>
        </motion.aside>
      </div>
    </RunContextProvider>
  );
}
