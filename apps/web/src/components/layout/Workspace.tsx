import { useRef, useEffect, useState } from "react";
import {
  type ProductMode,
  type RunMode,
} from "@repo/shared-types";
import { motion } from "framer-motion";
import { FileExplorerHandle } from "../FileExplorer";
import { ChatInterface } from "../chat/ChatInterface";
import { RunContextProvider } from "../../hooks/useRunContext";
import { useChat } from "../../hooks/useChat";
import { cn } from "../../lib/utils";
import { useGitStatus } from "../../hooks/useGitStatus";
import { Resizer } from "../ui/Resizer";
import { useWorkspaceState } from "./workspace/useWorkspaceState";
import { useGitHubTree } from "./workspace/useGitHubTree";
import { useFileLoader } from "./workspace/useFileLoader";
import { SidebarHeader } from "./workspace/SidebarHeader";
import { SidebarContent } from "./workspace/SidebarContent";
import { bootstrapGitWorkspace } from "../../lib/git-workspace-bootstrap";
import {
  loadStoredProductMode,
  persistProductMode,
} from "../../lib/product-mode-storage";
import { GitReviewProvider } from "../git/GitReviewContext";
import { GitReviewDialog } from "../git/GitReviewDialog";

interface WorkspaceProps {
  sessionId: string;
  runId: string;
  repository: string;
  mode?: RunMode;
  onModeChange?: (mode: RunMode) => void;
  onPendingApprovalStateChange?: (hasPendingApproval: boolean) => void;
  isRightSidebarOpen?: boolean;
  setIsRightSidebarOpen?: (open: boolean) => void;
  isGitReviewOpen?: boolean;
  gitReviewIntent?: "review" | "commit";
  onGitReviewOpenChange?: (open: boolean) => void;
}

export function Workspace({
  sessionId,
  runId: initialRunId,
  repository,
  mode = "build",
  onModeChange,
  onPendingApprovalStateChange,
  isRightSidebarOpen = false,
  setIsRightSidebarOpen,
  isGitReviewOpen = false,
  gitReviewIntent = "review",
  onGitReviewOpenChange,
}: WorkspaceProps) {
  const explorerRef = useRef<FileExplorerHandle>(null);
  const workspaceBootstrapKeyRef = useRef<string | null>(null);
  const workspaceBootstrapInFlightRef = useRef<string | null>(null);
  const previousChatLoadingRef = useRef(false);
  const sandboxId = sessionId;
  const [productMode, setProductMode] = useState<ProductMode>(() =>
    loadStoredProductMode(sessionId),
  );

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

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    append,
    stop,
    isLoading,
    isHydrating,
    runId: activeRunId,
    error: chatError,
    debugEvents,
  } = useChat(
    sessionId,
    initialRunId,
    () => {
      explorerRef.current?.refresh();
    },
    mode,
    productMode,
  );
  const { status, refetch: refetchGitStatus } = useGitStatus(
    activeRunId,
    sessionId,
  );
  const changesCount = status?.files?.length ?? 0;
  const repositoryOwner = repo?.owner?.login?.trim() ?? "";
  const repositoryName = repo?.name?.trim() ?? "";
  const repositoryBranch = (branch || repo?.default_branch || "main").trim();
  const repositoryBaseUrl = repo?.html_url;

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

  useEffect(() => {
    setProductMode(loadStoredProductMode(sessionId));
  }, [sessionId]);

  useEffect(() => {
    persistProductMode(sessionId, productMode);
  }, [productMode, sessionId]);

  useEffect(() => {
    const runFinished = previousChatLoadingRef.current && !isLoading;
    previousChatLoadingRef.current = isLoading;

    if (!runFinished) {
      return;
    }

    void refetchGitStatus(true);
  }, [isLoading, refetchGitStatus]);

  useEffect(() => {
    if (!sessionId || !activeRunId) {
      return;
    }

    if (!isGitHubLoaded) {
      return;
    }

    if (!repositoryOwner || !repositoryName) {
      return;
    }

    const bootstrapKey = `${sessionId}:${activeRunId}:${repositoryOwner}/${repositoryName}:${repositoryBranch}`;
    if (
      workspaceBootstrapKeyRef.current === bootstrapKey ||
      workspaceBootstrapInFlightRef.current === bootstrapKey
    ) {
      return;
    }

    workspaceBootstrapInFlightRef.current = bootstrapKey;
    const bootstrap = async (): Promise<void> => {
      let bootstrapReady = false;
      try {
        const result = await bootstrapGitWorkspace({
          runId: activeRunId,
          sessionId,
          repositoryOwner,
          repositoryName,
          repositoryBranch,
          repositoryBaseUrl,
        });
        if (result.status === "ready") {
          bootstrapReady = true;
          workspaceBootstrapKeyRef.current = bootstrapKey;
        }
        if (result.status !== "ready" && result.message) {
          if (result.status === "sync-failed") {
            console.debug(
              `[workspace/git-bootstrap] ${result.status}: ${result.message}`,
            );
          } else {
            console.warn(
              `[workspace/git-bootstrap] ${result.status}: ${result.message}`,
            );
          }
        }
      } catch (error) {
        console.warn("[workspace/git-bootstrap] failed", error);
      } finally {
        if (workspaceBootstrapInFlightRef.current === bootstrapKey) {
          workspaceBootstrapInFlightRef.current = null;
        }
        if (bootstrapReady) {
          await refetchGitStatus(true);
        }
      }
    };

    void bootstrap();
  }, [
    activeRunId,
    isGitHubLoaded,
    refetchGitStatus,
    repositoryBaseUrl,
    repositoryBranch,
    repositoryName,
    repositoryOwner,
    sessionId,
  ]);

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

  return (
    <RunContextProvider runId={activeRunId} sessionId={sessionId}>
      <GitReviewProvider
        isReviewOpen={isGitReviewOpen}
        onReviewOpenChange={(open) => onGitReviewOpenChange?.(open)}
      >
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
                runId: activeRunId,
                input,
                handleInputChange,
                handleSubmit,
                append,
                stop,
                isLoading,
                error: chatError,
                debugEvents,
              }}
              sessionId={sessionId}
              mode={mode}
              onModeChange={onModeChange}
              permissionMode={productMode}
              onPermissionModeChange={setProductMode}
              onPendingApprovalChange={onPendingApprovalStateChange}
              repoTree={repoTree}
              isLoadingRepoTree={isLoadingTree}
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
              onExpand={() => {
                setIsRightSidebarOpen?.(true);
                onGitReviewOpenChange?.(true);
              }}
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
              explorerRef={explorerRef}
              sandboxId={sandboxId}
              runId={activeRunId}
            />
          </div>
        </motion.aside>
        <GitReviewDialog
          key={`${activeRunId}:${isGitReviewOpen ? "open" : "closed"}:${gitReviewIntent}`}
          initialIntent={gitReviewIntent}
        />
      </div>
      </GitReviewProvider>
    </RunContextProvider>
  );
}
