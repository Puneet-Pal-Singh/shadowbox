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
      }
    });

    this.fitAddon = new FitAddon();
    this.term.loadAddon(this.fitAddon);
    this.term.loadAddon(new WebLinksAddon());
    
    this.term.onData(this.handleInput.bind(this));
  }

  mount(container: HTMLDivElement) {
    this.term.open(container);
    // Timeout ensures the DOM has dimensions before fitting
    setTimeout(() => this.fitAddon.fit(), 0);
    this.term.writeln(`\x1b[32m[System]\x1b[0m Session ID: ${this.sessionId}`);
  }

  connect() {
    this.ws = new WebSocket(`ws://localhost:8787/connect?session=${this.sessionId}`);
    
    this.ws.onopen = () => {
        this.term.writeln('\x1b[32m✔ Connected to Edge Runtime\x1b[0m\r\n$ ');
    };

    this.ws.onmessage = (e: MessageEvent<string>) => {
      const msg: WSEvent = JSON.parse(e.data);
      
      switch (msg.type) {
        case 'log':
          this.term.write(msg.data.replace(/\n/g, '\r\n'));
          break;
        case 'system':
          this.term.writeln(`\r\n\x1b[90m[sys] ${msg.data}\x1b[0m`);
          break;
        case 'error':
          this.term.writeln(`\r\n\x1b[31m[err] ${msg.data}\x1b[0m`);
          break;
        case 'finish':
          this.isExecuting = false;
          this.term.write('\r\n$ ');
          break;
      }
    };

    this.ws.onclose = () => this.term.writeln('\r\n\x1b[31m✖ Connection Lost\x1b[0m');
  }

  private async handleInput(data: string) {
    if (this.isExecuting) return; // Block input while waiting for previous command result

    const code = data.charCodeAt(0);
    if (code === 13) { // Enter
      this.term.write('\r\n');
      const cmd = this.currentLine.trim();
      if (cmd) {
        this.isExecuting = true;
        await this.executeRemote(cmd);
      } else {
        this.term.write('$ ');
      }
      this.currentLine = "";
    } else if (code === 127) { // Backspace
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
    const request = CommandService.parse(input);
    try {
      const response = await fetch(`http://localhost:8787/?session=${this.sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request)
      });
      
      if (!response.ok) {
        const err = await response.json() as { error: string };
        throw new Error(err.error || 'Execution failed');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.term.writeln(`\r\n\x1b[31m[Error] ${message}\x1b[0m`);
      this.isExecuting = false;
      this.term.write('$ ');
    }
  }

  destroy() {
    this.ws?.close();
    this.term.dispose();
  }
}