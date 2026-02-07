import { useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Folder, File, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';

interface FileItem {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileItem[];
  depth: number;
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
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['.']));

    const fetchFilesForPath = useCallback(async (path: string, depth: number): Promise<FileItem[]> => {
      try {
        const res = await fetch(`http://localhost:8787/?session=${sessionId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plugin: "filesystem",
            payload: { action: "list_files", runId, path }
          })
        });
        const data = await res.json();
        
        if (data.success && data.output) {
          const lines = data.output.split('\n').filter((l: string) => l.trim() && !l.includes('... and'));
          return lines.map((line: string) => {
            const name = line.replace('/', '');
            const isDir = line.endsWith('/');
            const itemPath = path === '.' ? name : `${path}/${name}`;
            return {
              name,
              path: itemPath,
              type: isDir ? 'directory' : 'file',
              depth
            };
          });
        }
      } catch (e) {
        console.error("Explorer Error:", e);
      }
      return [];
    }, [sessionId, runId]);

    const refresh = useCallback(async () => {
       const rootFiles = await fetchFilesForPath('.', 0);
       setFiles(rootFiles);
    }, [fetchFilesForPath]);

    useImperativeHandle(ref, () => ({
      refresh
    }));

    useEffect(() => {
      refresh();
    }, [refresh]);

    const toggleDirectory = async (path: string) => {
      const newExpanded = new Set(expandedPaths);
      if (newExpanded.has(path)) {
        newExpanded.delete(path);
        setExpandedPaths(newExpanded);
      } else {
        newExpanded.add(path);
        setExpandedPaths(newExpanded);
        
        // Fetch children if needed (simple implementation: re-fetch and merge)
        // For a more robust explorer, we'd store children in the file state
        const children = await fetchFilesForPath(path, 0); // depth is relative here for simplicity
        setFiles(prev => {
           const updateChildren = (items: FileItem[]): FileItem[] => {
              return items.map(item => {
                 if (item.path === path) {
                    return { ...item, children };
                 }
                 if (item.children) {
                    return { ...item, children: updateChildren(item.children) };
                 }
                 return item;
              });
           };
           return updateChildren(prev);
        });
      }
    };

    const renderItem = (item: FileItem) => {
      const isExpanded = expandedPaths.has(item.path);
      const isDir = item.type === 'directory';

      return (
        <div key={item.path} className="flex flex-col">
          <div 
            onClick={() => isDir ? toggleDirectory(item.path) : onFileClick?.(item.path)}
            className={cn(
               "flex items-center gap-1.5 p-1 px-2 hover:bg-zinc-800/50 rounded group cursor-pointer transition-colors",
               item.depth > 0 && "ml-3"
            )}
            style={{ paddingLeft: `${item.depth * 12 + 8}px` }}
          >
            {isDir ? (
               <>
                  {isExpanded ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
                  <Folder size={14} className="text-blue-500/80 shrink-0" />
               </>
            ) : (
              <>
                 <div className="w-3.5" />
                 <File size={14} className="text-zinc-500 group-hover:text-emerald-500 shrink-0 transition-colors" />
              </>
            )}
            <span className={cn(
               "text-[12px] truncate transition-colors",
               isDir ? "text-zinc-300 font-medium" : "text-zinc-400 group-hover:text-white"
            )}>
               {item.name}
            </span>
          </div>
          
          {isDir && isExpanded && item.children && (
            <div className="flex flex-col">
              {item.children.map(child => renderItem({ ...child, depth: item.depth + 1 }))}
            </div>
          )}
        </div>
      );
    };

    return (
      <div className="flex flex-col h-full bg-black select-none">
        <div className="flex-1 overflow-y-auto py-2">
          {files.map(file => renderItem(file))}
          {files.length === 0 && (
             <div className="px-4 py-8 text-center">
                <p className="text-xs text-zinc-600 italic">No files found</p>
             </div>
          )}
        </div>
      </div>
    );
  }
);

FileExplorer.displayName = 'FileExplorer';