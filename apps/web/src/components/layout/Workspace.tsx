import { useRef } from 'react';
import { FileExplorer, FileExplorerHandle } from '../FileExplorer';
import { ChatInterface } from '../chat/ChatInterface';
import { ArtifactView } from '../chat/ArtifactView';
import { useChat } from '../../hooks/useChat';
import { cn } from '../../lib/utils';

export function Workspace({ sessionId: agentId }: { sessionId: string }) {
  const explorerRef = useRef<FileExplorerHandle>(null);
  const sharedSessionId = "shared-workspace-v1"; // Fixed sandbox ID for the project
  
  const { 
    messages, 
    input, 
    handleInputChange, 
    handleSubmit, 
    isLoading, 
    isHydrating,
    artifactState 
  } = useChat(sharedSessionId, agentId, () => {
    // Refresh explorer when AI creates a file
    explorerRef.current?.refresh();
  });

  const { artifact, isArtifactOpen, setIsArtifactOpen, setArtifact } = artifactState;

  const handleFileClick = async (path: string) => {
    try {
      const res = await fetch(`http://localhost:8787/?session=${sharedSessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plugin: "filesystem",
          payload: { action: "read_file", path }
        })
      });
      const data = await res.json();
      if (data.success) {
        setArtifact({ path, content: data.output });
        setIsArtifactOpen(true);
      }
    } catch (e) {
      console.error("Failed to read file:", e);
    }
  };

  if (isHydrating) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Hydrating History...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex bg-background overflow-hidden relative">
      {/* 1. Left Sidebar: File Explorer */}
      <aside className="w-64 border-r border-border bg-background flex flex-col shrink-0">
        <FileExplorer 
          ref={explorerRef}
          sessionId={sharedSessionId} 
          onFileClick={handleFileClick}
        />
      </aside>

      {/* 2. Center: Main Chat */}
      <main className="flex-1 flex flex-col min-w-0 bg-background border-r border-border">
        <ChatInterface 
          chatProps={{ messages, input, handleInputChange, handleSubmit, isLoading }}
          onArtifactOpen={(path, content) => {
            setArtifact({ path, content });
            setIsArtifactOpen(true);
          }}
        />
      </main>

      {/* 3. Right Pane: Artifact Editor / Preview */}
      <aside 
        className={cn(
          "bg-[#1e1e1e] border-l border-border transition-all duration-300 ease-in-out relative shrink-0 overflow-hidden",
          isArtifactOpen ? "w-[45vw]" : "w-0 border-none"
        )}
      >
        {isArtifactOpen && (
          <div className="w-[45vw] h-full flex flex-col">
            <ArtifactView
              isOpen={isArtifactOpen}
              onClose={() => setIsArtifactOpen(false)}
              title={artifact?.path || 'Untitled'}
              content={artifact?.content || ''}
            />
          </div>
        )}
      </aside>
    </div>
  );
}
