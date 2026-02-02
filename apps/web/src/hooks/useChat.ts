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
      console.log(`🧬 [Shadowbox] Response:`, response.status);
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
      console.log(`🧬 [Shadowbox] Tool call:`, toolCall.toolName);
      if (toolCall.toolName === "create_code_artifact") {
        const args = toolCall.args as ArtifactData;

        if (args && args.path && args.content) {
          setArtifact(args);
          // Trigger file explorer refresh
          onFileCreated?.();
        }
      }
    },

    // DEBUG: Log what the SDK has at finish
    onFinish: (message) => {
      console.log(`🧬 [Shadowbox] SDK onFinish for ${runId}:`, message);
      console.log(
        `🧬 [Shadowbox] SDK messages at finish:`,
        messages.length,
        messages.map((m) => ({
          role: m.role,
          content: m.content?.substring(0, 30),
        })),
      );
    },
  });

  // EMERGENCY RESET: Only clear on initial runId change, not during streaming
  // We track if reset has been done for this runId to avoid clearing messages during active streaming
  const hasResetForRunId = useRef<string | null>(null);

  useEffect(() => {
    if (hasResetForRunId.current !== runId) {
      console.log(`🧬 [Shadowbox] Initial reset for ${runId}`);
      hasResetForRunId.current = runId;
      setMessages([]);
      agentStore.clearMessages(runId);
    }
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

      // CRITICAL: Don't sync if we already have messages from streaming
      // This prevents the server from overwriting the assistant response
      if (messages.length > 0) {
        console.log(
          `🧬 [Shadowbox] Skipping server sync - already have ${messages.length} messages`,
        );
        return;
      }

      // Wait for pending query to be consumed before syncing
      const pendingQuery = localStorage.getItem(`pending_query_${runId}`);
      if (pendingQuery) {
        console.log(
          `🧬 [Shadowbox] Delaying server sync - pending query exists`,
        );
        return;
      }

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

          // CRITICAL FIX: Convert stored message format to SDK format
          // The server stores messages with 'tool_calls' but SDK expects 'toolInvocations'
          const convertedHistory = history.map((msg: any, index: number) => {
            const converted: any = {
              id: msg.id || `${runId}-msg-${index}`,
              role: msg.role,
              content: msg.content,
              createdAt: msg.createdAt || new Date(),
            };

            // Convert tool_calls to toolInvocations for assistant messages
            if (
              msg.role === "assistant" &&
              msg.tool_calls &&
              msg.tool_calls.length > 0
            ) {
              converted.toolInvocations = msg.tool_calls.map(
                (tc: any, tcIndex: number) => ({
                  state: "result", // Assume completed since loading from history
                  toolCallId: tc.id || `${runId}-tool-${tcIndex}`,
                  toolName: tc.function?.name || "unknown",
                  args: (() => {
                    try {
                      return JSON.parse(tc.function?.arguments || "{}");
                    } catch {
                      return {};
                    }
                  })(),
                }),
              );
            }

            return converted;
          });

          console.log(
            `🧬 [Shadowbox] Converted ${convertedHistory.length} messages for SDK`,
          );
          setMessages(convertedHistory);
          agentStore.setMessages(runId, convertedHistory);
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

  // IMMEDIATE USER MESSAGE: Manually add to UI first, then trigger API
  const wrappedHandleSubmit = (e?: any) => {
    e?.preventDefault?.();

    const currentInput = input.trim();
    if (!currentInput || isLoading) return;

    console.log(`🧬 [Shadowbox] SUBMIT for ${runId}:`, {
      input: currentInput.substring(0, 50),
      messageCount: messages.length,
    });

    // CRITICAL FIX: Manually add user message to UI IMMEDIATELY
    // This ensures the message appears before any API call
    const userMessage = {
      id: `user-${Date.now()}`,
      role: "user" as const,
      content: currentInput,
      createdAt: new Date(),
    };

    // Add to local state immediately for instant UI feedback
    setMessages((prev) => [...prev, userMessage]);

    // Then use append to trigger the API call (it will add another copy but that's ok)
    append({ role: "user", content: currentInput });
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
