import { useSessionManager } from './hooks/useSessionManager';
import { GlobalNav } from './components/layout/GlobalNav';
import { AgentSidebar } from './components/layout/AgentSidebar';
import { Workspace } from './components/layout/Workspace';
import { AgentSetup } from './components/agent/AgentSetup';

function App() {
  const { 
    sessions, 
    activeSessionId, 
    setActiveSessionId, 
    createSession, 
    removeSession 
  } = useSessionManager();

  return (
    <div className="h-screen w-screen bg-background text-zinc-400 flex overflow-hidden font-sans">
      
      {/* 1. Navigation Layer (Static Global Nav) */}
      <GlobalNav onHome={() => setActiveSessionId(null)} />

      {/* 2. Session Management Layer (List of Active Tasks) */}
      <AgentSidebar 
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelect={setActiveSessionId}
        onCreate={() => setActiveSessionId(null)} // Show setup screen
        onRemove={removeSession}
      />

      {/* 3. Main Workspace Layer */}
      {activeSessionId ? (
        <Workspace key={activeSessionId} sessionId={activeSessionId} />
      ) : (
        <AgentSetup 
          onStart={(config) => {
            const name = config.task.length > 20 ? config.task.substring(0, 20) + "..." : config.task;
            const id = createSession(name);
            localStorage.setItem(`pending_query_${id}`, config.task);
          }} 
        />
      )}
    </div>
  );
}

export default App;
