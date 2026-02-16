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
  } = useGitHub();
  const [showRepoPicker, setShowRepoPicker] = useState(false);

  // Convert sessions to run inbox items (will be used in AppShell integration)
  // @ts-expect-error - currently unused, will be used in shell integration
  const runs: RunInboxItem[] = sessions.map((session) => {
    let status: "idle" | "queued" | "running" | "waiting" | "failed" | "complete" = "idle";
    if (session.status === "running") status = "running";
    else if (session.status === "completed") status = "complete";
    else if (session.status === "error") status = "failed";
    
    return {
      runId: session.runId,
      sessionId: session.id,
      title: session.name,
      status,
      updatedAt: new Date().toISOString(),
      repository: session.repository,
    };
  });

  // Sync UI shell store with active session
  useEffect(() => {
    if (activeSessionId) {
      uiShellStore.setActiveSessionId(activeSessionId);
      const activeSession = sessions.find((s) => s.id === activeSessionId);
      if (activeSession) {
        uiShellStore.setActiveRunId(activeSession.runId);
      }
    }
  }, [activeSessionId, sessions]);

  // Sync GitHub context with active session
  useEffect(() => {
    if (!activeSessionId) return;

    // Try to load context specific to this session
    const storedSessionContext = localStorage.getItem(
      `github_context_${activeSessionId}`,
    );

    if (storedSessionContext) {
      try {
        const { repo: storedRepo, branch: storedBranch } =
          JSON.parse(storedSessionContext);

        // Update global context if it differs
        if (
          repo?.full_name !== storedRepo.full_name ||
          branch !== storedBranch
        ) {
          console.log(
            `[App] Switching GitHub context to session ${activeSessionId}: ${storedRepo.full_name}`,
          );
          setContext(storedRepo, storedBranch);
        }
      } catch (e) {
        console.error("Failed to parse session GitHub context", e);
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
  }, [activeSessionId, repo, branch, setContext, clearContext]);

  // Check if user needs to select a repository on load
  useEffect(() => {
    console.log("[App] Checking repo picker:", {
      isGitHubContextLoaded,
      hasRepo: !!repo,
      isAuthenticated,
      hasSessions: sessions.length > 0
    });
    
    // ONLY show repo picker automatically if:
    // 1. Context is loaded
    // 2. No repo is currently selected
    // 3. User is authenticated
    // 4. User has NO existing sessions (it's a fresh start)
    if (isGitHubContextLoaded && !repo && isAuthenticated && sessions.length === 0) {
      // No repo selected and no sessions, show picker
      console.log("[App] Showing repo picker - fresh start, no repo or sessions");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowRepoPicker(true);
    } else if (isGitHubContextLoaded && repo) {
      console.log("[App] Repo already selected:", repo.full_name);
    }
  }, [isGitHubContextLoaded, repo, isAuthenticated, sessions.length]);

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(() => {
    return localStorage.getItem("shadowbox_right_sidebar_open") === "true";
  });
  const [sidebarWidth, setSidebarWidth] = useState(260);

  useEffect(() => {
    localStorage.setItem(
      "shadowbox_right_sidebar_open",
      String(isRightSidebarOpen),
    );
  }, [isRightSidebarOpen]);

  // Handle skip login - proceed without GitHub
  const handleSkipLogin = () => {
    // For now, we'll set a flag in localStorage to remember the choice
    localStorage.setItem("skip_github_auth", "true");
    // Force a reload to re-evaluate auth state
    window.location.reload();
  };

  // Get active session name for the header
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const taskTitle = activeSession?.name;
  const threadTitle = activeSession?.name;

  const handleNewTask = (repositoryName?: string) => {
    console.log("[App] handleNewTask called with:", repositoryName);
    
    // If no repo name provided, try to use the currently active repo
    const targetRepo = repositoryName || repo?.full_name;

    // Verify the repo actually exists in our folders list
    const repoExists = targetRepo && repositories.includes(targetRepo);

    if (targetRepo && repoExists) {
      console.log("[App] Creating new task for repo:", targetRepo);
      // Create a session for this specific repository
      const sessionName = `New Task`;
      const sessionId = createSession(sessionName, targetRepo);
      
      // Explicitly clear pending query for new task
      localStorage.removeItem(`pending_query_${sessionId}`);
      
      setActiveSessionId(sessionId);

      // Sync GitHub context
      const otherSessionWithRepo = sessions.find(
        (s) => s.repository === targetRepo,
      );

      if (otherSessionWithRepo) {
        const storedContext = localStorage.getItem(
          `github_context_${otherSessionWithRepo.id}`,
        );
        if (storedContext) {
          localStorage.setItem(`github_context_${sessionId}`, storedContext);
        }
      } else if (repo && repo.full_name === targetRepo) {
        localStorage.setItem(
          `github_context_${sessionId}`,
          JSON.stringify({ repo, branch }),
        );
      }
    } else {
      // If absolutely no repo is selected, targetRepo is missing, 
      // or the user has deleted the repo folder
      console.log("[App] No valid target repo found for new task, showing picker");
      setShowRepoPicker(true);
    }
  };

  const handleOpenIde = (ide: string) => {
    console.log("Opening in IDE:", ide);
  };

  const handleCommit = () => {
    console.log("Commit changes");
  };

  const handlePush = () => {
    console.log("Push to remote");
  };

  const handleStash = () => {
    console.log("Stash changes");
  };

  const handleToggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleToggleRightSidebar = () => {
    setIsRightSidebarOpen(!isRightSidebarOpen);
  };

  /**
   * Handle repository selection from RepoPicker
   * Creates a session immediately for the selected repository
   */
  const handleRepoSelect = (
    selectedRepo: Repository,
    selectedBranch: string,
  ) => {
    setContext(selectedRepo, selectedBranch);
    setShowRepoPicker(false);

    // Create a session immediately for this repository so it shows in sidebar
    const sessionName = `New Task`;
    const sessionId = createSession(sessionName, selectedRepo.full_name);
    setActiveSessionId(sessionId);

    // Store GitHub context for the session
    localStorage.setItem(
      `github_context_${sessionId}`,
      JSON.stringify({ repo: selectedRepo, branch: selectedBranch }),
    );

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

  // Check if current session has a pending query or messages
  const hasPendingQuery = activeSessionId ? !!localStorage.getItem(`pending_query_${activeSessionId}`) : false;
  
  // A session is considered to have "started" if:
  // 1. It has a pending query in localStorage
  // 2. OR its name has been changed from "New Task"
  // 3. OR its status is not "idle"
  const isSessionStarted = activeSession && (
    hasPendingQuery || 
    (activeSession.name !== "New Task" && activeSession.name !== "") ||
    (activeSession.status && activeSession.status !== "idle")
  );

  // Robust visibility flags
  const showSetup = !!activeSessionId && !isSessionStarted;
  const showWorkspace = !!activeSessionId && !!isSessionStarted;

  return (
    <div className="h-screen w-screen bg-background text-zinc-400 flex overflow-hidden font-sans">
      {/* Sidebar - Independent */}
      {isSidebarOpen && (
        <div className="relative flex shrink-0" style={{ width: sidebarWidth }}>
                      <AgentSidebar
                        sessions={sessions}
                        repositories={repositories}
                        activeSessionId={activeSessionId}
                        onSelect={setActiveSessionId}
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
                Math.max(160, Math.min(400, prev + delta)),
              )
            }
          />
        </div>
      )}

      {/* Main Content Area with Top NavBar */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top Navigation Bar - Only in content area */}
        <TopNavBar
          onOpenIde={handleOpenIde}
          onCommit={handleCommit}
          onPush={handlePush}
          onStash={handleStash}
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
                <AgentSetup
                  onRepoClick={() => setShowRepoPicker(true)}
                  onStart={(config) => {
                    const name =
                      config.task.length > 20
                        ? config.task.substring(0, 20) + "..."
                        : config.task;

                    updateSession(activeSessionId, { name, status: 'running' });
                    localStorage.setItem(`pending_query_${activeSessionId}`, config.task);
                    // Force a re-render to trigger state sync
                    setActiveSessionId(activeSessionId); 
                  }}
                />
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
                  runId={activeSession?.runId || ""}
                  repository={activeSession?.repository || ""}
                  isRightSidebarOpen={isRightSidebarOpen}
                  setIsRightSidebarOpen={setIsRightSidebarOpen}
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
