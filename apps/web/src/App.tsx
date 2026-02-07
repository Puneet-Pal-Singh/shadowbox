import { useState, useEffect } from "react";
import { useSessionManager } from "./hooks/useSessionManager";
import { AgentSidebar } from "./components/layout/AgentSidebar";
import { Workspace } from "./components/layout/Workspace";
import { AgentSetup } from "./components/agent/AgentSetup";
import { TopNavBar } from "./components/layout/TopNavBar";
import { StatusBar } from "./components/layout/StatusBar";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import {
  GitHubContextProvider,
  useGitHub,
} from "./components/github/GitHubContextProvider";
import { RepoPicker } from "./components/github/RepoPicker";
import { LoginScreen } from "./components/auth/LoginScreen";
import type { Repository } from "./services/GitHubService";
import { Resizer } from "./components/ui/Resizer";

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
    });
    if (isGitHubContextLoaded && !repo && isAuthenticated) {
      // No repo selected, show picker
      console.log("[App] Showing repo picker - no repo selected");
      setShowRepoPicker(true);
    } else if (isGitHubContextLoaded && repo) {
      console.log("[App] Repo already selected:", repo.full_name);
    }
  }, [isGitHubContextLoaded, repo, isAuthenticated]);

  const [activeTab, setActiveTab] = useState<"local" | "worktree">("local");
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

  const handleNewTask = () => {
    setActiveSessionId(null);
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
   * Sets the context but doesn't create a session yet
   */
  const handleRepoSelect = (
    selectedRepo: Repository,
    selectedBranch: string,
  ) => {
    setContext(selectedRepo, selectedBranch);
    setShowRepoPicker(false);

    console.log(
      `[App] Selected repository: ${selectedRepo.full_name}@${selectedBranch}`,
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

  // Show AgentSetup if user has selected a repo but no active session
  if (repo && !activeSessionId) {
    return (
      <div className="h-screen w-screen bg-background text-zinc-400 flex overflow-hidden font-sans">
        {/* Sidebar - Independent */}
        {isSidebarOpen && (
          <div
            className="relative flex shrink-0"
            style={{ width: sidebarWidth }}
          >
            <AgentSidebar
              sessions={sessions}
              activeSessionId={activeSessionId}
              onSelect={setActiveSessionId}
              onCreate={handleNewTask}
              onRemove={removeSession}
              onClose={handleToggleSidebar}
              onAddRepository={() => setShowRepoPicker(true)}
              width={sidebarWidth}
            />
            <Resizer
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
          <div className="flex-1 flex overflow-hidden">
            <AgentSetup
              onRepoClick={() => setShowRepoPicker(true)}
              onStart={(config) => {
                const name =
                  config.task.length > 20
                    ? config.task.substring(0, 20) + "..."
                    : config.task;

                // Use repository name from GitHub context if available
                const repoName = repo?.full_name || "New Project";
                const id = createSession(name, repoName);
                localStorage.setItem(`pending_query_${id}`, config.task);

                // Pass GitHub context to the session
                if (repo) {
                  localStorage.setItem(
                    `github_context_${id}`,
                    JSON.stringify({ repo, branch }),
                  );
                }
              }}
            />
          </div>

          {/* Status Bar */}
          <StatusBar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            branchName={branch || "main"}
          />
        </div>
      </div>
    );
  }

  // Show main workspace if user has an active session
  return (
    <div className="h-screen w-screen bg-background text-zinc-400 flex overflow-hidden font-sans">
      {/* Sidebar - Independent */}
      {isSidebarOpen && (
        <div className="relative flex shrink-0" style={{ width: sidebarWidth }}>
          <AgentSidebar
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelect={setActiveSessionId}
            onCreate={handleNewTask}
            onRemove={removeSession}
            onClose={handleToggleSidebar}
            onAddRepository={() => setShowRepoPicker(true)}
            width={sidebarWidth}
          />
          <Resizer
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
        <div className="flex-1 flex overflow-hidden">
          {activeSessionId ? (
            <Workspace
              key={activeSessionId}
              sessionId={activeSessionId}
              repository={activeSession?.repository || ""}
              isRightSidebarOpen={isRightSidebarOpen}
              setIsRightSidebarOpen={setIsRightSidebarOpen}
            />
          ) : (
            <AgentSetup
              onRepoClick={() => setShowRepoPicker(true)}
              onStart={(config) => {
                const name =
                  config.task.length > 20
                    ? config.task.substring(0, 20) + "..."
                    : config.task;

                // Use repository name from GitHub context if available
                const repoName = repo?.full_name || "New Project";
                const id = createSession(name, repoName);
                localStorage.setItem(`pending_query_${id}`, config.task);

                // Pass GitHub context to the session
                if (repo) {
                  localStorage.setItem(
                    `github_context_${id}`,
                    JSON.stringify({ repo, branch }),
                  );
                }
              }}
            />
          )}
        </div>

        {/* Status Bar */}
        <StatusBar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          branchName={branch || "main"}
        />
      </div>
    </div>
  );
}

export default App;
