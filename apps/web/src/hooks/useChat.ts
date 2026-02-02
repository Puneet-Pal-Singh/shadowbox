import { useChat as useVercelChat } from "@ai-sdk/react";
import { useState, useEffect, useRef } from "react";
import { agentStore } from "../store/agentStore";

// Define the shape of our artifact
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

  // FORCE REMOUNT: Use a unique instance key that only changes when runId changes
  // This ensures the Vercel AI SDK completely resets its internal state
  const instanceKeyRef = useRef(`${runId}-${Date.now()}`);
  const previousRunIdRef = useRef(runId);

  if (previousRunIdRef.current !== runId) {
    // runId changed, generate new key to force SDK remount
    previousRunIdRef.current = runId;
    instanceKeyRef.current = `${runId}-${Date.now()}`;
    console.log(`🧬 [Shadowbox] FORCING SDK REMOUNT for ${runId}`);
  }

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    stop,
    setMessages,
    append,
  } = useVercelChat({
    api: "http://localhost:8788/chat", // Point to the brain worker /chat endpoint
    body: { sessionId, runId },
    initialMessages: [], // ALWAYS start empty - never hydrate from cache on init
    id: instanceKeyRef.current, // Unique per runId to force complete SDK state reset

    onError: (error: Error) => {
      console.error("🧬 [Shadowbox] Chat Stream Broken", error);
    },

    onResponse: (response) => {
      if (!response.ok) {
        console.error(
          "🧬 [Shadowbox] HTTP Error:",
          response.status,
          response.statusText,
        );
      }
    },

    // Auto-update artifact data but don't force open the side-pane automatically
    onToolCall: ({ toolCall }) => {
      if (toolCall.toolName === "create_code_artifact") {
        const args = toolCall.args as ArtifactData;

        if (args && args.path && args.content) {
          setArtifact(args);
          // Trigger file explorer refresh
          onFileCreated?.();
        }
      }
    },

    // DEBUG: Log what the SDK is about to send
    onFinish: (message) => {
      console.log(`🧬 [Shadowbox] SDK onFinish for ${runId}:`, message);
    },
  });

  // 0. EMERGENCY RESET: Clear messages immediately when runId changes
  // This is a safety net to ensure no cross-session contamination
  useEffect(() => {
    console.log(`🧬 [Shadowbox] EMERGENCY RESET for ${runId}`);
    setMessages([]);
    // Also clear from agentStore to prevent any cached data from appearing
    agentStore.clearMessages(runId);
  }, [runId, setMessages]);

  // 1. Sync local messages to global store for tab switching
  // DEBUG: Log message changes to detect contamination
  useEffect(() => {
    console.log(
      `🧬 [Shadowbox] Messages updated for ${runId}:`,
      messages.length,
      "messages",
    );
    if (messages.length > 0) {
      console.log(`🧬 [Shadowbox] First message role:`, messages[0]?.role);
      console.log(
        `🧬 [Shadowbox] Last message role:`,
        messages[messages.length - 1]?.role,
      );
      agentStore.setMessages(runId, messages);
    }
  }, [messages, runId]);

  // Track if this is the first load for this runId
  const isFirstLoadRef = useRef(true);

  // 2. Server-Only Sync: NEVER load from cache on initial load
  // This prevents cross-session contamination where Agent A's messages appear in Agent B
  useEffect(() => {
    // Reset first load flag when runId changes
    if (isFirstLoadRef.current === false) {
      isFirstLoadRef.current = true;
    }

    async function sync() {
      // Guard: Don't sync from server if we are currently streaming a response
      if (isLoading) return;

      // Only sync on first load for this runId
      if (!isFirstLoadRef.current) return;
      isFirstLoadRef.current = false;

      // CRITICAL FIX: Always start with empty messages, never from cache
      // The cache is only for temporary recovery (tab switch), not initial load
      console.log(`🧬 [Shadowbox] Initializing fresh session ${runId}`);
      setMessages([]);
      setIsHydrating(true);

      console.log(`🧬 [Shadowbox] Loading ${runId} from server...`);
      try {
        const res = await fetch(
          `http://localhost:8787/chat?session=${sessionId}&runId=${runId}`,
        );
        if (!res.ok) throw new Error("History fetch failed");
        const history = await res.json();

        // Only populate if this is still the current runId (prevent race conditions)
        if (Array.isArray(history)) {
          console.log(
            `🧬 [Shadowbox] Server returned ${history.length} messages for ${runId}`,
          );
          setMessages(history);
          agentStore.setMessages(runId, history);
        }
      } catch (e) {
        console.error("🧬 [Shadowbox] Sync Failed:", e);
        // Keep empty on error - don't show stale data
        setMessages([]);
      } finally {
        setIsHydrating(false);
      }
    }
    sync();
  }, [sessionId, runId, setMessages, isLoading]);

  // 3. Pending Query Consumption
  useEffect(() => {
    const pendingQuery = localStorage.getItem(`pending_query_${runId}`);
    if (pendingQuery && messages.length === 0 && !isLoading) {
      console.log(`🧬 [Shadowbox] Consuming pending query for ${runId}`);
      append({ role: "user", content: pendingQuery });
      localStorage.removeItem(`pending_query_${runId}`);
    }
  }, [runId, messages.length, isLoading, append]);

  // DEBUG: Wrap handleSubmit to log what messages are being sent
  const wrappedHandleSubmit = (e?: any) => {
    console.log(`🧬 [Shadowbox] SUBMIT for ${runId}:`, {
      messageCount: messages.length,
      firstMessage: messages[0]?.content?.substring(0, 50),
      lastMessage: messages[messages.length - 1]?.content?.substring(0, 50),
    });
    handleSubmit(e);
  };

  return {
    messages,
    input,
    handleInputChange,
    handleSubmit: wrappedHandleSubmit,
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
