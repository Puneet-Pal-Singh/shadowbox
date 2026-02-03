import { useChat as useVercelChat } from "@ai-sdk/react";
import { useState, useEffect, useRef } from "react";
import { agentStore } from "../store/agentStore";

export interface ArtifactData {
  path: string;
  content: string;
}

export function useChat(
  sessionId: string,
  runId: string = "default",
  onFileCreated?: () => void,
) {
  const [artifact, setArtifact] = useState<ArtifactData | null>(null);
  const [isArtifactOpen, setIsArtifactOpen] = useState(false);
  const [isHydrating, setIsHydrating] = useState(false);
  const hasHydratedRef = useRef(false);

  // Generate stable instance key per runId
  const instanceKeyRef = useRef(`${runId}`);
  const previousRunIdRef = useRef(runId);

  if (previousRunIdRef.current !== runId) {
    previousRunIdRef.current = runId;
    instanceKeyRef.current = `${runId}`;
    hasHydratedRef.current = false;
  }

  const {
    messages,
    input,
    handleInputChange,
    isLoading,
    stop,
    setMessages,
    append,
  } = useVercelChat({
    api: "http://localhost:8788/chat",
    body: { sessionId, runId },
    initialMessages: [],
    id: instanceKeyRef.current,

    onError: (error: Error) => {
      console.error("🧬 [Shadowbox] Chat Stream Error:", error.message);
    },

    onToolCall: ({ toolCall }) => {
      if (toolCall.toolName === "create_code_artifact") {
        const args = toolCall.args as ArtifactData;
        if (args?.path && args?.content) {
          setArtifact(args);
          onFileCreated?.();
        }
      }
    },
  });

  // Sync to global store for tab switching
  useEffect(() => {
    if (messages.length > 0) {
      agentStore.setMessages(runId, messages);
    }
  }, [messages, runId]);

  // One-time hydration from server on mount
  useEffect(() => {
    if (hasHydratedRef.current) return;
    if (messages.length > 0) return; // Don't hydrate if user already sent a message

    async function hydrate() {
      setIsHydrating(true);
      try {
        const res = await fetch(
          `http://localhost:8787/chat?session=${sessionId}&runId=${runId}`,
        );
        if (!res.ok) throw new Error("History fetch failed");
        const history = await res.json();

        if (Array.isArray(history) && history.length > 0) {
          // Convert server format to SDK format
          const convertedHistory = history.map((msg: any, index: number) => ({
            id: msg.id || `${runId}-msg-${index}`,
            role: msg.role,
            content: msg.content,
            createdAt: msg.createdAt || new Date(),
            toolInvocations:
              msg.role === "assistant" && msg.tool_calls
                ? msg.tool_calls.map((tc: any, tcIndex: number) => ({
                    state: "result" as const,
                    toolCallId: tc.id || `${runId}-tool-${tcIndex}`,
                    toolName: tc.function?.name || "unknown",
                    args: (() => {
                      try {
                        return JSON.parse(tc.function?.arguments || "{}");
                      } catch {
                        return {};
                      }
                    })(),
                  }))
                : undefined,
          }));

          setMessages(convertedHistory);
        }
      } catch (e) {
        console.error("🧬 [Shadowbox] Hydration failed:", e);
      } finally {
        setIsHydrating(false);
        hasHydratedRef.current = true;
      }
    }

    hydrate();
  }, [sessionId, runId, setMessages]); // Only run on mount

  // Handle pending query from localStorage
  useEffect(() => {
    const pendingQuery = localStorage.getItem(`pending_query_${runId}`);
    if (pendingQuery && messages.length === 0 && !isLoading) {
      append({ role: "user", content: pendingQuery });
      localStorage.removeItem(`pending_query_${runId}`);
    }
  }, [runId, messages.length, isLoading, append]);

  // Simple submit handler
  const handleSubmit = (e?: any) => {
    e?.preventDefault?.();
    const currentInput = input.trim();
    if (!currentInput || isLoading) return;

    append({ role: "user", content: currentInput });
  };

  return {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    append,
    isLoading,
    isHydrating,
    stop,
    artifactState: {
      artifact,
      setArtifact,
      isArtifactOpen,
      setIsArtifactOpen,
    },
  };
}
