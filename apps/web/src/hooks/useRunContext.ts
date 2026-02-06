import { createContext, useContext } from "react";

interface RunContextValue {
  runId: string | null;
}

const RunContext = createContext<RunContextValue | null>(null);

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
  return (
    <RunContext.Provider value={{ runId }}>
      {children}
    </RunContext.Provider>
  );
}
