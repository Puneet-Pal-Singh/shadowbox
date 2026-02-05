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

  return (
    <div className="h-screen w-screen bg-background text-zinc-400 flex flex-col overflow-hidden font-sans">
      {/* Top Navigation Bar */}
      <TopNavBar
        onNewThread={handleNewThread}
        onOpenIde={handleOpenIde}
        onCommit={handleCommit}
        onPush={handlePush}
        onStash={handleStash}
      />

      {/* Main Layout: Sidebar + Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Session Management Layer (List of Active Tasks) */}
        <AgentSidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelect={setActiveSessionId}
          onCreate={handleNewThread}
          onRemove={removeSession}
        />

        {/* Main Workspace Layer */}
        {activeSessionId ? (
          <Workspace key={activeSessionId} sessionId={activeSessionId} />
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
  );
}

export default App;
