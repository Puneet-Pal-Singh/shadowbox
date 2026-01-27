import { Terminal } from '../Terminal';
import { FileExplorer } from '../FileExplorer';
import { ChatInterface } from '../chat/ChatInterface';
import { Cpu } from 'lucide-react';

interface WorkspaceProps {
  sessionId: string;
}

export function Workspace({ sessionId }: WorkspaceProps) {
  return (
    <div className="flex-1 flex bg-black relative min-w-0">
      
      {/* LEFT PANE: Intelligent Agent (The Brain) */}
      <div className="flex-1 flex flex-col border-r border-zinc-800 bg-background">
        <ChatInterface sessionId={sessionId} />
      </div>

      {/* RIGHT PANE: Context & Execution (The Muscle) */}
      <div className="w-112.5 flex flex-col bg-background">
        
        {/* Top Right: File System */}
        <div className="h-1/2 border-b border-zinc-800 flex flex-col">
          <FileExplorer sessionId={sessionId} />
        </div>
        
        {/* Bottom Right: Live Terminal */}
        <div className="h-1/2 flex flex-col">
          <header className="h-8 border-b border-zinc-800 flex items-center justify-between px-4 bg-[#0c0c0e]">
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Terminal Output</span>
            <div className="flex items-center gap-2 text-[10px] text-zinc-600">
               <Cpu size={10} />
               <span>Ready</span>
            </div>
          </header>
          
          <div className="flex-1 p-2 overflow-hidden bg-black">
            {/* The Terminal handles its own WebSocket connection based on sessionId */}
            <Terminal key={sessionId} sessionId={sessionId} />
          </div>
        </div>
      </div>
    </div>
  );
}