// apps/web/src/App.tsx
import { Terminal } from './components/Terminal';
import { useSessionManager } from './hooks/useSessionManager';
import { 
  Box, 
  Plus, 
  Terminal as TerminalIcon, 
  X, 
  ShieldCheck,
  Activity
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function App() {
  const { 
    sessions, 
    activeSessionId, 
    setActiveSessionId, 
    createSession, 
    removeSession 
  } = useSessionManager();

  return (
    <div className="flex h-full w-full bg-background text-zinc-400 overflow-hidden font-sans">
      
      {/* Side Navigation */}
      <aside className="w-16 border-r border-zinc-800 flex flex-col items-center py-4 gap-4 bg-[#0c0c0e]">
        <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center text-white mb-4">
          <Box size={24} />
        </div>
        <nav className="flex flex-col gap-4">
          <div className="p-2 text-zinc-500 hover:text-white cursor-pointer"><ShieldCheck size={20}/></div>
          <div className="p-2 text-zinc-500 hover:text-white cursor-pointer"><Activity size={20}/></div>
        </nav>
      </aside>

      {/* Agents Sidebar */}
      <aside className="w-64 border-r border-zinc-800 flex flex-col bg-background">
        <div className="p-4 flex items-center justify-between border-b border-zinc-800">
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Active Agents</h2>
          {/* FIX: Wrap in anonymous function to prevent MouseEvent being passed as 'name' */}
          <button 
            onClick={() => createSession()} 
            className="p-1 hover:bg-zinc-800 rounded text-zinc-300 transition-colors"
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {sessions.length === 0 && (
            <div className="text-center mt-10 px-4">
              <p className="text-xs text-zinc-600 italic">No agents running.</p>
            </div>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => setActiveSessionId(s.id)}
              className={cn(
                "group flex items-center justify-between p-2 rounded-md cursor-pointer mb-1 transition-all",
                activeSessionId === s.id ? "bg-zinc-800 text-white" : "hover:bg-zinc-900"
              )}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <TerminalIcon size={14} className={activeSessionId === s.id ? "text-green-500" : ""} />
                <span className="text-sm truncate">{s.name}</span>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); removeSession(s.id); }}
                className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col bg-black relative">
        {activeSessionId ? (
          <>
            <header className="h-10 border-b border-zinc-800 flex items-center px-4 bg-background">
              <div className="flex items-center gap-2 text-[10px] font-mono">
                <span className="text-green-500">● LIVE</span>
                <span className="text-zinc-600">ID: {activeSessionId}</span>
              </div>
            </header>
            <div className="flex-1 p-4 overflow-hidden">
              <Terminal key={activeSessionId} sessionId={activeSessionId} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <TerminalIcon size={32} className="text-zinc-800" />
            <p className="text-sm text-zinc-500">Initialize a session to begin</p>
            <button 
              onClick={() => createSession()}
              className="px-4 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-zinc-200 transition-colors"
            >
              New Agent
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;