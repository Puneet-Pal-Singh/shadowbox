import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSessionManager } from "./hooks/useSessionManager";
import { AgentSidebar } from "./components/layout/AgentSidebar";
import { Workspace } from "./components/layout/Workspace";
import { AgentSetup } from "./components/agent/AgentSetup";
import { TopNavBar } from "./components/layout/TopNavBar";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import {
  GitHubContextProvider,
  useGitHub,
} from "./components/github/GitHubContextProvider";
import { RepoPicker } from "./components/github/RepoPicker";
import { LoginScreen } from "./components/auth/LoginScreen";
import type { Repository } from "./services/GitHubService";
import { Resizer } from "./components/ui/Resizer";
import { uiShellStore } from "./store/uiShellStore";
import type { RunInboxItem } from "./components/run/RunInbox";
import { SessionStateService } from "./services/SessionStateService";
import { RunContextProvider } from "./hooks/useRunContext";

/**
 * Main App Component
 * Wraps everything in AuthProvider and GitHubContextProvider
 */
function App() {
  return (
    <AuthProvider>
      <GitHubContextProvider>
        <AppContent />
      </GitHubContextProvider>
    </AuthProvider>
  );
}

/**
 * App Content - Contains the main application logic
 * Separated to allow useAuth hook access within AuthProvider
 */
function AppContent() {
  const {
    sessions,
    activeSessionId,
    setActiveSessionId,
    createSession,
    removeSession,
    updateSession,
    repositories,
    removeRepository,
    renameRepository,
  } = useSessionManager();

  const { isAuthenticated, isLoading, login } = useAuth();
  const {
    repo,
    branch,
    setContext,
    clearContext,
    isLoaded: isGitHubContextLoaded,
    saveSessionContext,
  } = useGitHub();
  const [showRepoPicker, setShowRepoPicker] = useState(false);
  const [isGitReviewOpen, setIsGitReviewOpen] = useState(false);
  const [gitReviewSessionId, setGitReviewSessionId] = useState<string | null>(null);
  const [gitReviewIntent, setGitReviewIntent] = useState<"review" | "commit">(
    "review",
  );

  // Get active session for workspace rendering
  // Use memoized activeSession to avoid unnecessary re-renders
  const activeSession = sessions.find((s) => s.id === activeSessionId) || null;

  // Convert sessions to run inbox items for shell navigation
  // This supports the run-centric UI model and will be passed to AppShell in future PRs
  // TODO: Use this in AppShell integration (PR 04)
  // @ts-expect-error - intentionally unused, will be used in next PR
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const convertSessionsToRuns = (): RunInboxItem[] => {
    return sessions.map((session) => {
      let status: "idle" | "queued" | "running" | "waiting" | "failed" | "complete" = "idle";
      if (session.status === "running") status = "running";
      else if (session.status === "completed") status = "complete";
      else if (session.status === "error") status = "failed";

      // Get session's last update time from localStorage or use current time
      const sessionUpdateKey = `session_updated_at_${session.id}`;
      const savedUpdateTime = localStorage.getItem(sessionUpdateKey);
      const updatedAt = savedUpdateTime || new Date().toISOString();

      return {
        runId: session.activeRunId,
        sessionId: session.id,
        title: session.name,
        status,
        updatedAt,
        repository: session.repository,
      };
    });
  };

  // Sync UI shell store with active session
  useEffect(() => {
    if (!activeSessionId) return;

    const storeState = uiShellStore.getState();

    // Only sync if the active session actually changed
    if (storeState.activeSessionId === activeSessionId) {
      return;
    }

    uiShellStore.setActiveSessionId(activeSessionId);

    // Find active session's runId and sync it
    // Note: This lookup is safe because we've already validated activeSessionId exists
    if (activeSession) {
      uiShellStore.setActiveRunId(activeSession.activeRunId);
    }
  }, [activeSessionId, activeSession]);

  // Sync GitHub context with active session
  // Uses SessionStateService for session-scoped storage
  useEffect(() => {
    if (!activeSessionId) return;
    if (!activeSession) return;

    const sessionContext = SessionStateService.loadSessionGitHubContext(
      activeSessionId,
    );

    if (sessionContext) {
      // Reconstruct Repository object from stored context
      // Only include fields actually needed; others should be loaded on demand
      const storedRepo: Repository = {
        id: 0,
        name: sessionContext.repoName,
        full_name: sessionContext.fullName,
        owner: {
          login: sessionContext.repoOwner,
          avatar_url: "", // Not stored; can be fetched from GitHub API if needed
        },
        description: null,
        private: false,
        html_url: `https://github.com/${sessionContext.fullName}`,
        clone_url: `https://github.com/${sessionContext.fullName}.git`,
        default_branch: sessionContext.branch,
        stargazers_count: 0,
        language: null,
        updated_at: new Date().toISOString(),
      };

      // Update global context if it differs
      if (
        repo?.full_name !== sessionContext.fullName ||
        branch !== sessionContext.branch
      ) {
        console.log(
          `[App] Switching GitHub context to session ${activeSessionId}: ${sessionContext.fullName}`,
        );
        setContext(storedRepo, sessionContext.branch);
      }
    } else {
      // No stored context for this session.
      // If we have a lingering repo context, clear it to ensure isolation.
      if (repo) {
        console.log(
          `[App] Clearing GitHub context for session ${activeSessionId} (no associated repo)`,
        );
        clearContext();
      }
    }
  }, [
    activeSessionId,
    activeSession,
    repo,
    branch,
    setContext,
    clearContext,
  ]);

  // Check if user needs to select a repository on load
  useEffect(() => {
    console.log("[App] Checking repo picker:", {
      isGitHubContextLoaded,
      hasRepo: !!repo,
      isAuthenticated,
      hasSessions: sessions.length > 0,
    });
    
    if (!isGitHubContextLoaded || !isAuthenticated) return;

    // Fresh start: no repo, no sessions → show picker
    if (!repo && sessions.length === 0) {
      console.log("[App] Showing repo picker - fresh start, no repo or sessions");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowRepoPicker(true);
      return;
    }

    if (repo) {
      console.log("[App] Repo already selected:", repo.full_name);
    }
  }, [isGitHubContextLoaded, repo, isAuthenticated, sessions.length]);

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(() => {
    return localStorage.getItem("shadowbox_right_sidebar_open") === "true";
  });
  const [sidebarWidth, setSidebarWidth] = useState(320);

  useEffect(() => {
    localStorage.setItem(
      "shadowbox_right_sidebar_open",
      String(isRightSidebarOpen),
    );
  }, [isRightSidebarOpen]);

  // Check if current session has a pending query or messages
  const hasPendingQuery = activeSessionId
    ? !!SessionStateService.loadSessionPendingQuery(activeSessionId)
    : false;

  // A session is considered to have "started" if:
  // 1. It has a pending query in session-scoped storage
  // 2. OR its name has been changed from "New Task"
  // 3. OR its status is not "idle"
  const isSessionStarted =
    !!activeSession &&
    (hasPendingQuery ||
      (activeSession.name !== "New Task" && activeSession.name !== "") ||
      (activeSession.status && activeSession.status !== "idle"));

  // Robust visibility flags
  const showSetup = !!activeSessionId && !!activeSession && !isSessionStarted;
  const showWorkspace =
    !!activeSessionId && !!activeSession && !!isSessionStarted;

  // Handle skip login - proceed without GitHub
  const handleSkipLogin = () => {
    // For now, we'll set a flag in localStorage to remember the choice
    localStorage.setItem("skip_github_auth", "true");
    // Force a reload to re-evaluate auth state
    window.location.reload();
  };

  // Get active session name for the header
  const taskTitle = activeSession?.name;
  const threadTitle = activeSession?.name;

  const handleNewTask = (repositoryName?: string) => {
    console.log("[App] handleNewTask called with:", repositoryName);
    setIsGitReviewOpen(false);
    setGitReviewSessionId(null);
    setGitReviewIntent("review");

    // If no repo name provided, try to use the currently active repo
    const targetRepo = repositoryName || repo?.full_name;

    if (targetRepo) {
      console.log("[App] Creating new task for repo:", targetRepo);
      setShowRepoPicker(false);
      // Create a session for this specific repository
      const sessionName = `New Task`;
      const sessionId = createSession(sessionName, targetRepo);

      // Clear pending query for new task
      SessionStateService.clearSessionPendingQuery(sessionId);

      // Sync GitHub context with new session
      // Use SessionStateService for session-scoped storage
      const otherSessionWithRepo = sessions.find(
        (s) => s.repository === targetRepo,
      );

      if (otherSessionWithRepo) {
        const sessionContext = SessionStateService.loadSessionGitHubContext(
          otherSessionWithRepo.id,
        );
        if (sessionContext) {
          SessionStateService.saveSessionGitHubContext(sessionId, sessionContext);
        }
      } else if (repo && repo.full_name === targetRepo) {
        // Copy current GitHub context to new session
        saveSessionContext(sessionId);
      }
    } else {
      // If absolutely no repo is selected, targetRepo is missing,
      // or the user has deleted the repo folder
      console.log("[App] No valid target repo found for new task, showing picker");
      setShowRepoPicker(true);
    }
  };

  const openGitReview = (intent: "review" | "commit") => {
    if (!activeSessionId || !activeSession) {
      return;
    }

    setIsRightSidebarOpen(true);
    setGitReviewIntent(intent);
    setIsGitReviewOpen(true);
    setGitReviewSessionId(activeSessionId);
  };

  const handleReview = () => {
    openGitReview("review");
  };

  const handleCommit = () => {
    openGitReview("commit");
  };

  const handleToggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleToggleRightSidebar = () => {
    setIsRightSidebarOpen((previous) => !previous);
  };

  const handleSelectSession = (sessionId: string) => {
    if (sessionId !== activeSessionId) {
      setIsGitReviewOpen(false);
      setGitReviewSessionId(null);
      setGitReviewIntent("review");
    }
    setActiveSessionId(sessionId);
  };

  /**
   * Handle repository selection from RepoPicker
   * Creates a session immediately for the selected repository
   */
  const handleRepoSelect = (
    selectedRepo: Repository,
    selectedBranch: string,
  ) => {
    setIsGitReviewOpen(false);
    setGitReviewSessionId(null);
    setGitReviewIntent("review");
    setContext(selectedRepo, selectedBranch);
    setShowRepoPicker(false);

    // Create a session immediately for this repository so it shows in sidebar
    const sessionName = `New Task`;
    const sessionId = createSession(sessionName, selectedRepo.full_name);

    // Store GitHub context for the session using SessionStateService
    SessionStateService.saveSessionGitHubContext(sessionId, {
      repoOwner: selectedRepo.owner.login,
      repoName: selectedRepo.name,
      fullName: selectedRepo.full_name,
      branch: selectedBranch,
    });

    console.log(
      `[App] Selected repository: ${selectedRepo.full_name}@${selectedBranch}, created session: ${sessionId}`,
    );
  };

  /**
   * Handle skip - allow user to proceed without GitHub
   */
  const handleSkipRepoPicker = () => {
    setShowRepoPicker(false);
    console.log("[App] Skipped repository selection");
  };

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-background flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-zinc-600 border-t-white rounded-full" />
      </div>
    );
  }

  // Show LoginScreen if user is not authenticated
  if (!isAuthenticated) {
    return <LoginScreen onLogin={login} onSkip={handleSkipLogin} />;
  }

  // Show RepoPicker if user needs to select a repository
  if (showRepoPicker) {
    return (
      <div className="h-screen w-screen bg-background flex items-center justify-center">
        <RepoPicker
          onRepoSelect={handleRepoSelect}
          onSkip={handleSkipRepoPicker}
        />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-background text-zinc-400 flex overflow-hidden font-sans">
      {/* Sidebar - Independent */}
      {isSidebarOpen && (
        <div className="relative flex shrink-0" style={{ width: sidebarWidth }}>
                      <AgentSidebar
                        sessions={sessions}
                        repositories={repositories}
                        activeSessionId={activeSessionId}
                        onSelect={handleSelectSession}
                        onCreate={handleNewTask}
                        onRemove={removeSession}
                        onRemoveRepository={removeRepository}
                        onRenameRepository={renameRepository}
                        onClose={handleToggleSidebar}
                        onAddRepository={() => setShowRepoPicker(true)}
                        width={sidebarWidth}
                      />          <Resizer
            side="left"
            onResize={(delta) =>
              setSidebarWidth((prev) =>
                Math.max(160, Math.min(520, prev + delta)),
              )
            }
          />
        </div>
      )}

      {/* Main Content Area with Top NavBar */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top Navigation Bar - Only in content area */}
        <TopNavBar
          onReview={showWorkspace ? handleReview : undefined}
          onCommit={showWorkspace ? handleCommit : undefined}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={handleToggleSidebar}
          isRightSidebarOpen={isRightSidebarOpen}
          onToggleRightSidebar={handleToggleRightSidebar}
          threadTitle={threadTitle}
          taskTitle={taskTitle}
          isAuthenticated={isAuthenticated}
          onConnectGitHub={login}
        />

        {/* Main Workspace Layer */}
        <div className="flex-1 flex overflow-hidden relative bg-black">
          <AnimatePresence mode="wait">
            {showSetup ? (
              <motion.div
                key={`setup-${activeSessionId}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 flex"
              >
                <RunContextProvider
                  runId={activeSession.activeRunId}
                  sessionId={activeSession.id}
                >
                  <AgentSetup
                    sessionId={activeSessionId}
                    mode={activeSession.mode}
                    onModeChange={(mode) =>
                      updateSession(activeSessionId, { mode })
                    }
                    isRightSidebarOpen={isRightSidebarOpen}
                    onRepoClick={() => setShowRepoPicker(true)}
                    onStart={(config) => {
                      const name =
                        config.task.length > 20
                          ? config.task.substring(0, 20) + "..."
                          : config.task;

                      updateSession(activeSessionId, {
                        name,
                        status: "running",
                        mode: config.mode,
                      });
                      // Store pending query in session-scoped storage
                      SessionStateService.saveSessionPendingQuery(
                        activeSessionId,
                        config.task,
                      );
                      // State updates above (updateSession + saveSessionPendingQuery)
                      // will naturally trigger re-renders; no manual trigger needed
                    }}
                  />
                </RunContextProvider>
              </motion.div>
            ) : showWorkspace ? (
              <motion.div
                key={`workspace-${activeSessionId}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 flex"
              >
                <Workspace
                  sessionId={activeSessionId}
                  runId={activeSession?.activeRunId || ""}
                  repository={activeSession?.repository || ""}
                  mode={activeSession?.mode}
                  onModeChange={(mode) =>
                    updateSession(activeSessionId, { mode })
                  }
                  isRightSidebarOpen={isRightSidebarOpen}
                  setIsRightSidebarOpen={setIsRightSidebarOpen}
                  isGitReviewOpen={
                    isGitReviewOpen && gitReviewSessionId === activeSessionId
                  }
                  gitReviewIntent={gitReviewIntent}
                  onGitReviewOpenChange={(open) => {
                    setIsGitReviewOpen(open);
                    setGitReviewSessionId(open ? activeSessionId : null);
                    if (!open) {
                      setGitReviewIntent("review");
                    }
                  }}
                />
              </motion.div>
            ) : (
              <motion.div 
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex-1 flex items-center justify-center text-zinc-600 italic text-sm"
              >
                Select or create a task to get started
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export default App;
