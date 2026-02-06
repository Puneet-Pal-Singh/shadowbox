import { useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Folder, File } from 'lucide-react';

interface FileItem {
  name: string;
  type: 'file' | 'directory';
}

export interface FileExplorerHandle {
  refresh: () => void;
}

interface FileExplorerProps {
  sessionId: string;
  runId: string;
  onFileClick?: (path: string) => void;
}

export const FileExplorer = forwardRef<FileExplorerHandle, FileExplorerProps>(
  ({ sessionId, runId, onFileClick }, ref) => {
    const [files, setFiles] = useState<FileItem[]>([]);

    const fetchFiles = useCallback(async () => {
      try {
        const res = await fetch(`http://localhost:8787/?session=${sessionId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plugin: "filesystem",
            payload: { action: "list_files", runId, path: "." }
          })
        });
        const data = await res.json();
        
        if (data.success && data.output) {
          const lines = data.output.split('\n').filter((l: string) => l.trim());
          const mapped: FileItem[] = lines.map((line: string) => ({
            name: line.replace('/', ''),
            type: line.endsWith('/') ? 'directory' : 'file'
          }));
          setFiles(mapped);
        }
      } catch (e) {
        console.error("Explorer Error:", e);
      }
    }, [sessionId]);

    useImperativeHandle(ref, () => ({
      refresh: fetchFiles
    }));

    useEffect(() => {
      fetchFiles();
    }, [fetchFiles]);

    return (
      <div className="flex flex-col h-full bg-black">
        <div className="flex-1 overflow-y-auto p-2">
          {files.map((file) => (
                    <div 
                      key={file.name} 
                      onClick={() => file.type === 'file' && onFileClick?.(file.name)}
                      className={`flex items-center gap-2 p-1.5 hover:bg-surface rounded group ${file.type === 'file' ? 'cursor-pointer' : 'cursor-default'}`}
                    >              {file.type === 'directory' ? (
                <Folder size={14} className="text-blue-500" />
              ) : (
                <File size={14} className="text-zinc-500 group-hover:text-emerald-500" />
              )}
              <span className="text-xs text-zinc-300 truncate group-hover:text-white transition-colors">{file.name}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
);

FileExplorer.displayName = 'FileExplorer';
