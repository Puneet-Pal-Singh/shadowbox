// apps/web/src/components/Terminal.tsx
import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';

interface TerminalProps {
  sessionId: string;
}

const THEME = {
  background: '#09090b',
  foreground: '#f4f4f5',
  cursor: '#22c55e',
  selectionBackground: '#3f3f46',
};

// Define a union type for all possible payloads
type PluginPayload = 
  | { code: string }                            // Python
  | { action: string; path?: string; content?: string } // Filesystem
  | { url: string }                             // Git
  | Record<string, unknown>;                    // Generic fallback

export function Terminal({ sessionId }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"JetBrains Mono", monospace',
      theme: THEME,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(terminalRef.current);
    fitAddon.fit();
    xtermRef.current = term;

    term.writeln(`\x1b[32m[System]\x1b[0m Initializing Session: ${sessionId}`);

    const ws = new WebSocket(`ws://localhost:8787/connect?session=${sessionId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      term.writeln('\x1b[32m✔ Connected to Edge Runtime\x1b[0m\r\n');
      term.write('$ ');
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'log') term.write(msg.data.replace(/\n/g, '\r\n'));
      if (msg.type === 'finish') term.write('\r\n$ ');
      if (msg.type === 'error') term.writeln(`\x1b[31mError: ${msg.data}\x1b[0m`);
    };

    let currentLine = "";
    // FIX: Explicitly type 'data' as string
    const disposable = term.onData((data: string) => {
      const code = data.charCodeAt(0);
      if (code === 13) {
        term.write('\r\n');
        const cmd = currentLine.trim();
        if (cmd) {
            let plugin = "python";
            // FIX: Correct typing for payload
            let payload: PluginPayload = { code: cmd };
           
            if (cmd.startsWith('ls')) {
                plugin = "filesystem";
                payload = { action: "list_files" };
            }
           
            fetch(`http://localhost:8787/?session=${sessionId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ plugin, payload })
            });
        } else {
          term.write('$ ');
        }
        currentLine = "";
      } else if (code === 127) {
        if (currentLine.length > 0) {
          currentLine = currentLine.slice(0, -1);
          term.write('\b \b');
        }
      } else {
        currentLine += data;
        term.write(data);
      }
    });

    return () => {
      term.dispose();
      ws.close();
      disposable.dispose();
    };
  }, [sessionId]);

  return <div ref={terminalRef} className="h-full w-full" />;
}