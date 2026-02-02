import { useState } from 'react';
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

      {/* 2. Session Management Layer (List of Active Tasks) */}
      <AgentSidebar 
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelect={setActiveSessionId}
        onCreate={() => createSession()}
        onRemove={removeSession}
      />

      {/* 3. Main Workspace Layer */}
      {activeSessionId ? (
        <Workspace key={activeSessionId} sessionId={activeSessionId} />
      ) : (
        <WelcomeScreen 
          onStartTask={(query) => {
            const id = createSession();
            // We'll need a way to pass the initial query to the new session
            // For now, we'll just create it and the user can type there, 
            // or we can store the pending query in a store.
            localStorage.setItem(`pending_query_${id}`, query);
          }} 
        />
      )}
    </div>
  );
}

// Sub-component for Landing Page (Inbox View)
function WelcomeScreen({ onStartTask }: { onStartTask: (query: string) => void }) {
  const [input, setInput] = useState("");

  return (
    <main className="flex-1 flex flex-col items-center justify-center p-6 bg-black relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-900/50 via-black to-black" />
      
      <div className="relative w-full max-w-2xl flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center mb-2 shadow-2xl shadow-white/10">
            <TerminalIcon size={24} className="text-black" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Shadowbox</h1>
          <p className="text-sm text-zinc-500">What should we build today?</p>
        </div>

        <form 
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) onStartTask(input);
          }}
          className="w-full relative group"
        >
          <input 
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Implement worktree isolation in Rust..."
            className="w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl py-4 px-6 text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 transition-all shadow-2xl"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <span className="text-[10px] font-bold text-zinc-600 border border-zinc-800 rounded px-1.5 py-0.5">Enter</span>
          </div>
        </form>

        <div className="grid grid-cols-2 gap-3 w-full">
          {[
            "Build a Vite + React dashboard",
            "Setup a Cloudflare Worker API",
            "Fix CORS issues in Express",
            "Create a CLI tool in Go"
          ].map(task => (
            <button 
              key={task}
              onClick={() => onStartTask(task)}
              className="text-left p-4 bg-zinc-900/30 border border-zinc-800/50 rounded-xl hover:bg-zinc-800/50 hover:border-zinc-700 transition-all group"
            >
              <p className="text-xs text-zinc-400 group-hover:text-zinc-200">{task}</p>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}

export default App;