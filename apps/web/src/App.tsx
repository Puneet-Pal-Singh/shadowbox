import { Terminal } from './components/Terminal';
import { FileExplorer } from './components/FileExplorer';
import { useSessionManager } from './hooks/useSessionManager';
import { 
  Box, 
  Plus, 
  Terminal as TerminalIcon, 
  X, 
  ShieldCheck,
  Activity,
  Cpu,
  Database,
  Folder
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
    <div className="h-screen w-screen bg-background text-zinc-400 flex overflow-hidden font-sans">
      
      {/* Column 1: Global Navigation (Slim) */}
      <aside className="w-14 border-r border-border flex flex-col items-center py-4 gap-4 bg-[#0c0c0e]">
        <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center text-white mb-2 shadow-lg shadow-accent/5">
          <Box size={20} className="text-accent" />
        </div>
        <nav className="flex flex-col gap-4 mt-2">
          <div className="p-2 text-zinc-500 hover:text-white cursor-pointer transition-colors"><ShieldCheck size={18}/></div>
          <div className="p-2 text-zinc-500 hover:text-white cursor-pointer transition-colors"><Database size={18}/></div>
          <div className="p-2 text-zinc-500 hover:text-white cursor-pointer transition-colors"><Activity size={18}/></div>
        </nav>
      </aside>

      {/* Column 2: Agents Management */}
      <aside className="w-60 border-r border-border flex flex-col bg-background">
        <div className="p-4 flex items-center justify-between border-b border-border">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Agents</h2>
          <button 
            onClick={() => createSession()} 
            className="p-1 hover:bg-surface rounded text-zinc-300 transition-colors border border-transparent hover:border-border"
          >
            <Plus size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {sessions.length === 0 && (
            <div className="text-center mt-8 px-4">
              <p className="text-[10px] text-zinc-600 italic">No active agents.</p>
            </div>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => setActiveSessionId(s.id)}
              className={cn(
                "group flex items-center justify-between p-2 rounded-md cursor-pointer mb-1 transition-all",
                activeSessionId === s.id ? "bg-surface text-white border border-border" : "hover:bg-surface/50 text-zinc-500 border border-transparent"
              )}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <TerminalIcon size={12} className={activeSessionId === s.id ? "text-accent" : ""} />
                <span className="text-xs truncate">{s.name}</span>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); removeSession(s.id); }}
                className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-opacity"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Column 3: Context Area (File Explorer) */}
      <aside className="w-64 border-r border-border flex flex-col bg-background">
        {activeSessionId ? (
          <FileExplorer sessionId={activeSessionId} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-20 p-8 text-center">
            <Folder size={40} className="mb-2" />
            <span className="text-[10px] uppercase font-bold tracking-tighter">No Context</span>
          </div>
        )}
      </aside>

      {/* Main Content (The Stage) */}
      <main className="flex-1 flex flex-col bg-black relative min-w-0">
        {activeSessionId ? (
          <>
            <header className="h-10 border-b border-border flex items-center px-4 justify-between bg-background">
              <div className="flex items-center gap-4 text-[10px] font-mono">
                <div className="flex items-center gap-1.5">
                   <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                   <span className="text-accent">LIVE RUNTIME</span>
                </div>
                <span className="text-zinc-600">SID: {activeSessionId.split('-')[1]}</span>
              </div>
              <div className="flex items-center gap-4 text-[10px] font-mono text-zinc-500">
                <div className="flex items-center gap-1"><Cpu size={10}/> <span>1.2%</span></div>
              </div>
            </header>
            <div className="flex-1 p-4">
              <Terminal key={activeSessionId} sessionId={activeSessionId} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-6">
            <div className="relative">
               <div className="absolute inset-0 bg-accent/20 blur-2xl rounded-full" />
               <TerminalIcon size={48} className="text-zinc-800 relative" />
            </div>
            <div className="text-center">
              <h3 className="text-zinc-200 font-bold mb-1">Welcome to Shadowbox</h3>
              <p className="text-xs text-zinc-500 max-w-50">Initialize a persistent secure runtime to start building.</p>
            </div>
            <button 
              onClick={() => createSession()}
              className="px-6 py-2 bg-white text-black rounded-full text-xs font-bold hover:bg-zinc-200 transition-all active:scale-95 shadow-xl shadow-white/5"
            >
              Spawn Agent
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;