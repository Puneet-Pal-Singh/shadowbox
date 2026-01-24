import { useMemo, useEffect } from 'react';
import { TerminalController } from '../lib/TerminalController';

export function useTerminalController(sessionId: string) {
  // We use useMemo to create the controller only when sessionId changes.
  // This is NOT an effect. It's stable instance creation.
  const controller = useMemo(() => new TerminalController(sessionId), [sessionId]);

  useEffect(() => {
    // Only Effect logic: External synchronization (Networking)
    controller.connect();
    return () => controller.destroy();
  }, [controller]);

  return controller;
}