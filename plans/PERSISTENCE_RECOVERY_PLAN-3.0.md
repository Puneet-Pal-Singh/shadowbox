@PERSISTENCE_RECOVERY_PLAN-3.0.md

We are implementing the **"Persistence Engine"** for Shadowbox.
Currently, switching agents wipes chat history. We need to move state to Cloudflare Durable Objects using a "Run-Based" architecture.

Execute this **Strict Implementation Plan**:

### 1. The Storage Muscle (`apps/secure-agent-api`)
**File:** `src/core/AgentRuntime.ts`
1.  **State:** Add `this.ctx.storage` logic to store chat history keyed by `chat:${runId}`.
2.  **Concurrency Safety (CRITICAL):** Wrap all write operations in `this.ctx.blockConcurrencyWhile(async () => { ... })` to prevent race conditions.
3.  **API:**
    -   `GET /chat?runId=...` -> Returns `CoreMessage[]`.
    -   `POST /chat?runId=...` -> Accepts `{ message: CoreMessage }`. Appends it to the list.

### 2. The Orchestrator Logic (`apps/brain`)
**File:** `src/controllers/ChatController.ts`
1.  **Persist First:** Before calling `streamText`, send the incoming **User Message** to the Muscle (`POST /chat`).
2.  **Persist Last:** Inside `streamText`, use the `onFinish` callback to send the generated **Assistant Message** to the Muscle (`POST /chat`).
    -   *Note:* This ensures history is saved even if the browser disconnects.

### 3. The Frontend Hydration (`apps/web`)
**File:** `src/hooks/useChat.ts`
1.  **Dependency:** Accept `runId` as a prop.
2.  **Hydration:** Use `useEffect` when `runId` changes:
    -   Set `isLoadingHistory` to true.
    -   Fetch history from `/api/chat?runId=${runId}`.
    -   Call `setMessages(history)` (from Vercel SDK).
    -   Set `isLoadingHistory` to false.
3.  **Visuals:** Return `isLoadingHistory` so the UI can show a skeleton loader during agent switching.

**Goal:** Reliable, race-condition-free persistence. Refreshing the page or switching agents must preserve exact history.