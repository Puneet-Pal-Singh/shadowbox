import { useRef } from 'react';
import { FileExplorer, FileExplorerHandle } from '../FileExplorer';
import { ChatInterface } from '../chat/ChatInterface';
import { ArtifactView } from '../chat/ArtifactView';
import { useChat } from '../../hooks/useChat';

export function Workspace({ sessionId }: { sessionId: string }) {
  const explorerRef = useRef<FileExplorerHandle>(null);
  
  const { 
    messages, 
    input, 
    handleInputChange, 
    handleSubmit, 
    isLoading, 
    artifactState 
  } = useChat(sessionId, () => {
    // Refresh explorer when AI creates a file
    explorerRef.current?.refresh();
  });

  const { artifact, isArtifactOpen, setIsArtifactOpen, setArtifact } = artifactState;

  const handleFileClick = async (path: string) => {
    try {
      // Fetch file content from secure API
      const res = await fetch(`http://localhost:8787/?session=${sessionId}`, {
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

  return (
    <div className="flex-1 flex bg-black overflow-hidden relative">
      {/* 1. Main Chat */}
      <div className="flex-1 flex flex-col bg-background">
        <ChatInterface 
          chatProps={{ messages, input, handleInputChange, handleSubmit, isLoading }}
        />
      </div>

      {/* 2. File Context (Right Sidebar) */}
      <aside className="w-64 border-l border-border bg-background flex flex-col">
        <FileExplorer 
          ref={explorerRef}
          sessionId={sessionId} 
          onFileClick={handleFileClick}
        />
      </aside>

      {/* 3. Artifact Overlay (Slide-over) */}
      <ArtifactView
        isOpen={isArtifactOpen}
        onClose={() => setIsArtifactOpen(false)}
        title={artifact?.path || 'Untitled'}
        content={artifact?.content || ''}
      />
    </div>
  );
}
