import { useEffect, useState, useCallback } from 'react';
import { Folder, File, RefreshCw, Loader2 } from 'lucide-react';

interface FileItem {
  name: string;
  type: 'file' | 'directory';
}

export function FileExplorer({ sessionId }: { sessionId: string }) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Wrap in useCallback to satisfy the dependency array
  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8787/?session=${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plugin: "filesystem",
          payload: { action: "list_files", path: "." }
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
    } finally {
      setLoading(false);
    }
  }, [sessionId]); // Depends on sessionId

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]); // Correctly depends on the memoized function

  return (
    <div className="flex flex-col h-full bg-background border-r border-border">
      <div className="p-4 flex items-center justify-between border-b border-border">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Explorer</h2>
        <button onClick={fetchFiles} className="text-zinc-500 hover:text-white transition-colors">
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {files.length === 0 && !loading && (
          <div className="text-[10px] text-zinc-600 text-center mt-4">Empty Directory</div>
        )}
        {files.map((file, i) => (
          <div key={i} className="flex items-center gap-2 p-1.5 hover:bg-surface rounded cursor-default group">
            {file.type === 'directory' ? <Folder size={14} className="text-blue-500" /> : <File size={14} className="text-zinc-500" />}
            <span className="text-xs text-zinc-300 truncate">{file.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}