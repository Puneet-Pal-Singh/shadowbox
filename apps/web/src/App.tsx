import { useState } from "react";
import { useSessionManager } from "./hooks/useSessionManager";
import { AgentSidebar } from "./components/layout/AgentSidebar";
import { Workspace } from "./components/layout/Workspace";
import { AgentSetup } from "./components/agent/AgentSetup";
import { TopNavBar } from "./components/layout/TopNavBar";
import { StatusBar } from "./components/layout/StatusBar";

function App() {
  const {
    sessions,
    activeSessionId,
    setActiveSessionId,
    createSession,
    removeSession,
  } = useSessionManager();

  const [activeTab, setActiveTab] = useState<"local" | "worktree">("local");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(false);

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
              }}
            />
          )}
        </div>

        {/* Status Bar */}
        <StatusBar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          branchName="main"
        />
      </div>
    </div>
  );
}

export default App;