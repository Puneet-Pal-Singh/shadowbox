import { useEffect, useRef } from 'react';
import { useTerminalController } from '../hooks/useTerminalController';

export function Terminal({ sessionId }: { sessionId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const controller = useTerminalController(sessionId);

  useEffect(() => {
    // Synchronization with the DOM
    if (containerRef.current) {
      controller.mount(containerRef.current);
    }
  }, [controller]);

  return <div ref={containerRef} className="h-full w-full" />;
}