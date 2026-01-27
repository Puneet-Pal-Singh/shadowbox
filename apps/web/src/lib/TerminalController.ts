// apps/web/src/lib/TerminalController.ts
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { CommandService } from './command-service';
import { WSEvent } from '../types/terminal';

export class TerminalController {
  private term: XTerm;
  private fitAddon: FitAddon;
  private ws: WebSocket | null = null;
  private currentLine: string = "";
  private sessionId: string;
  private isExecuting: boolean = false;
  private isDisposed: boolean = false; // Safety Flag
  private resizeObserver: ResizeObserver | null = null;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    
    this.term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"JetBrains Mono", monospace',
      theme: { 
        background: '#09090b', 
        foreground: '#f4f4f5', 
        cursor: '#22c55e',
        selectionBackground: '#3f3f46'
      },
      allowProposedApi: true
    });

    this.fitAddon = new FitAddon();
    this.term.loadAddon(this.fitAddon);
    this.term.loadAddon(new WebLinksAddon());
    
    this.term.onData(this.handleInput.bind(this));
  }

  mount(container: HTMLDivElement) {
    if (this.isDisposed) return;

    this.term.open(container);
    
    // Only observe if we successfully opened
    if (this.term.element) {
      this.resizeObserver = new ResizeObserver(() => {
          // Debounce slightly to allow layout to settle
          requestAnimationFrame(() => this.safeFit());
      });
      this.resizeObserver.observe(container);
    }
    // Initial fit
    setTimeout(() => this.safeFit(), 50);
    
    this.term.writeln(`\x1b[32m[System]\x1b[0m Session: ${this.sessionId}`);
  }

  connect() {
    if (this.isDisposed || this.ws) return;

    this.ws = new WebSocket(`ws://localhost:8787/connect?session=${this.sessionId}`);
    
    this.ws.onopen = () => {
      if (!this.isDisposed) {
        // this.term.writeln('\x1b[32m✔ Connected to Edge Runtime\x1b[0m\r\n$ ');
        // Just show a clean status, the first prompt comes from the 'system' event
        this.term.writeln('\x1b[32m✔ Terminal Uplink Established\x1b[0m');
      }
    };

    this.ws.onmessage = (e: MessageEvent<string>) => {
      if (this.isDisposed) return;
      const msg: WSEvent = JSON.parse(e.data);
      
      switch (msg.type) {
        case 'log':
          this.term.write(msg.data.replace(/\n/g, '\r\n'));
          break;
        case 'system':
          this.term.write(`\r\n\x1b[90m[sys] ${msg.data}\x1b[0m\r\n$ `);
          break;
        case 'error':
          this.term.write(`\r\n\x1b[31m[err] ${msg.data}\x1b[0m\r\n$ `);
          break;
        case 'finish':
          this.isExecuting = false;
          this.term.write('\r\n$ ');
          break;
      }
    };

    this.ws.onclose = (e) => {
      if (this.isDisposed) return;
      // 1000 = Normal Closure (Component unmount), 1006 = Error
      if (e.code !== 1000 && !e.wasClean) {
        this.term.writeln('\r\n\x1b[31m✖ Connection Lost\x1b[0m');
      }
      this.ws = null;
    };
  }

  private safeFit() {
    if (this.isDisposed) return;
    
    // 🔥 FIX: Strict check for DOM presence and dimensions
    const el = this.term.element;
    if (!el || !el.isConnected || el.clientWidth === 0 || el.clientHeight === 0) {
      return;
    }

    try {
      this.fitAddon.fit();
    } catch {
      // Suppress internal xterm errors during layout shifts
    }
  }

  private async handleInput(data: string) {
    if (this.isExecuting || this.isDisposed) return; 

    const code = data.charCodeAt(0);
    if (code === 13) { 
      this.term.write('\r\n');
      const cmd = this.currentLine.trim();
      if (cmd) {
        this.isExecuting = true;
        await this.executeRemote(cmd);
      } else {
        this.term.write('$ ');
      }
      this.currentLine = "";
    } else if (code === 127) { 
      if (this.currentLine.length > 0) {
        this.currentLine = this.currentLine.slice(0, -1);
        this.term.write('\b \b');
      }
    } else {
      this.currentLine += data;
      this.term.write(data);
    }
  }

  private async executeRemote(input: string) {
    if (this.isDisposed) return;
    const request = CommandService.parse(input);
    try {
      await fetch(`http://localhost:8787/?session=${this.sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.term.writeln(`\r\n\x1b[31m[Error] ${errorMessage}\x1b[0m`);
      this.isExecuting = false;
      this.term.write('$ ');
    }
  }

  destroy() {
    this.isDisposed = true; // Block all future ops
    this.resizeObserver?.disconnect();
    
    if (this.ws) {
      this.ws.close(1000, "Component Unmounted"); // Clean close code
      this.ws = null;
    }
    
    this.term.dispose();
  }
}