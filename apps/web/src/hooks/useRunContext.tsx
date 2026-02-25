/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect } from "react";

interface RunContextValue {
  runId: string | null;
}

const RunContext = createContext<RunContextValue | null>(null);
const SESSION_RUN_ID_KEY = "currentRunId";

export function useRunContext(): RunContextValue {
  const context = useContext(RunContext);
  
  if (!context) {
    // Fallback for when context is not available
    const runId = sessionStorage.getItem("currentRunId");
    return { runId };
  }
  
  return context;
}

export function RunContextProvider({
  children,
  runId,
}: {
  children: React.ReactNode;
  runId: string;
}) {
  useEffect(() => {
    sessionStorage.setItem(SESSION_RUN_ID_KEY, runId);

    return () => {
      if (sessionStorage.getItem(SESSION_RUN_ID_KEY) === runId) {
        sessionStorage.removeItem(SESSION_RUN_ID_KEY);
      }
    };
  }, [runId]);

  return (
    <RunContext.Provider value={{ runId }}>
      {children}
    </RunContext.Provider>
  );
}
