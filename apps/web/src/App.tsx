import { Terminal as TerminalIcon } from 'lucide-react';
import { useSessionManager } from './hooks/useSessionManager';
import { GlobalNav } from './components/layout/GlobalNav';
import { AgentSidebar } from './components/layout/AgentSidebar';
import { Workspace } from './components/layout/Workspace';

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
      <GlobalNav />

      {/* 2. Session Management Layer (List of Agents) */}
      <AgentSidebar 
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelect={setActiveSessionId}
        onCreate={() => createSession()} // Wraps the call to handle optional args
        onRemove={removeSession}
      />

      {/* 3. Main Workspace Layer (Chat + Terminal + Explorer) */}
      {activeSessionId ? (
        <Workspace key={activeSessionId} sessionId={activeSessionId} />
      ) : (
        <WelcomeScreen onCreate={() => createSession()} />
      )}
    </div>
  );
}

// Sub-component for Empty State 
// (Keeps the main App component clean - Single Responsibility Principle)
function WelcomeScreen({ onCreate }: { onCreate: () => void }) {
  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-6 bg-black">
      <div className="relative">
          <div className="absolute inset-0 bg-accent/20 blur-2xl rounded-full" />
          <TerminalIcon size={48} className="text-zinc-800 relative" />
      </div>
      <div className="text-center">
        <h3 className="text-zinc-200 font-bold mb-1">Welcome to Shadowbox</h3>
        <p className="text-xs text-zinc-500 max-w-50">
          Initialize a persistent secure runtime to start building.
        </p>
      </div>
      <button 
        onClick={onCreate}
        className="px-6 py-2 bg-white text-black rounded-full text-xs font-bold hover:bg-zinc-200 transition-all active:scale-95 shadow-xl shadow-white/5"
      >
        Spawn Agent
      </button>
    </main>
  );
}

export default App;