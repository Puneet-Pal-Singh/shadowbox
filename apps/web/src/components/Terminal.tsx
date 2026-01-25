// apps/web/src/components/Terminal.tsx
import { useEffect, useRef } from 'react';
import { TerminalController } from '../lib/TerminalController';

interface TerminalProps {
  sessionId: string;
}

export function Terminal({ sessionId }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // We use a ref to track the active controller instance
  const controllerRef = useRef<TerminalController | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // 1. Create Instance
    const controller = new TerminalController(sessionId);
    controllerRef.current = controller;

    // 2. Mount to DOM
    controller.mount(containerRef.current);

    // 3. Connect Network
    controller.connect();

    // 4. Cleanup Function (Runs on unmount or session change)
    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
  }, [sessionId]);

  return (
    <div 
      ref={containerRef} 
      className="h-full w-full min-h-0 bg-black overflow-hidden" 
    />
  );
}