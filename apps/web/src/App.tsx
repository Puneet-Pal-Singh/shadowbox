import { useState, useEffect } from "react";
import { useSessionManager } from "./hooks/useSessionManager";
import { AgentSidebar } from "./components/layout/AgentSidebar";
import { Workspace } from "./components/layout/Workspace";
import { AgentSetup } from "./components/agent/AgentSetup";
import { TopNavBar } from "./components/layout/TopNavBar";
import { StatusBar } from "./components/layout/StatusBar";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { RepoPicker } from "./components/github/RepoPicker";
import { LoginScreen } from "./components/auth/LoginScreen";
import type { Repository } from "./services/GitHubService";

/**
 * Main App Component
 * Wraps everything in AuthProvider for GitHub authentication
 */
function App() {
  return (
    <AuthProvider>
      <AppContent />
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
  const [showRepoPicker, setShowRepoPicker] = useState(false);
  const [githubContext, setGithubContext] = useState<{
    repo: Repository | null;
    branch: string | null;
  }>({ repo: null, branch: null });

  const [activeTab, setActiveTab] = useState<"local" | "worktree">("local");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);

  // Check if we should show repo picker on mount
  useEffect(() => {
    if (!isLoading && isAuthenticated && !githubContext.repo) {
      // User is authenticated but hasn't selected a repo yet
      setShowRepoPicker(true);
    }
  }, [isLoading, isAuthenticated, githubContext.repo]);

  // Handle skip login - proceed without GitHub
  const handleSkipLogin = () => {
    // For now, we'll set a flag in localStorage to remember the choice
    localStorage.setItem("skip_github_auth", "true");
    // Force a reload to re-evaluate auth state
    window.location.reload();
  };

  // Get active session name for the header
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const threadTitle = activeSession?.name;

  const handleNewThread = () => {
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
   */
  const handleRepoSelect = (repo: Repository, branch: string) => {
    setGithubContext({ repo, branch });
    setShowRepoPicker(false);

    // Store in localStorage for persistence
    localStorage.setItem(
      "github_context",
      JSON.stringify({
        repoOwner: repo.owner.login,
        repoName: repo.name,
        branch,
        fullName: repo.full_name,
      }),
    );

    console.log(`[App] Selected repository: ${repo.full_name}@${branch}`);
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
        <AgentSidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelect={setActiveSessionId}
          onCreate={handleNewThread}
          onRemove={removeSession}
          onClose={handleToggleSidebar}
        />
      )}

      {/* Main Content Area with Top NavBar */}
      <div className="flex-1 flex flex-col overflow-hidden">
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
          isAuthenticated={isAuthenticated}
          onConnectGitHub={login}
        />

        {/* Main Workspace Layer */}
        <div className="flex-1 flex overflow-hidden">
          {activeSessionId ? (
            <Workspace
              key={activeSessionId}
              sessionId={activeSessionId}
              threadTitle={threadTitle}
              isRightSidebarOpen={isRightSidebarOpen}
              onRightSidebarClose={() => setIsRightSidebarOpen(false)}
            />
          ) : (
            <AgentSetup
              onStart={(config) => {
                const name =
                  config.task.length > 20
                    ? config.task.substring(0, 20) + "..."
                    : config.task;
                const id = createSession(name);
                localStorage.setItem(`pending_query_${id}`, config.task);

                // Pass GitHub context to the session
                if (githubContext.repo) {
                  localStorage.setItem(
                    `github_context_${id}`,
                    JSON.stringify(githubContext),
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
          branchName={githubContext.branch || "main"}
        />
      </div>
    </div>
  );
}

export default App;