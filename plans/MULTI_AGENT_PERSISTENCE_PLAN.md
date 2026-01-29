# 🧬 Shadowbox: Multi-Agent Context Persistence Plan

## 🎯 Objective
Enable seamless switching between multiple agents working on the same repository without losing chat history. History must be persisted on the server (Cloudflare Durable Objects).

## 🏗️ Architectural Concept
- **The Sandbox DO** (Durable Object) becomes the "Source of Truth" for history.
- **Message Indexing**: Messages are stored in the DO mapped by `agentId`.
- **Hydration**: When the UI switches to an agent, it "hydrates" the chat from the DO.

---

## 🛠️ Task 1: Durable Object State Expansion (`apps/secure-agent-api`)
**File**: `src/core/AgentRuntime.ts`
**Instruction**:
- Add a persistent property `history: Map<string, Message[]>` to the Durable Object state.
- Implement two new methods:
    1. `getHistory(agentId: string)`: Returns the message array for a specific agent.
    2. `appendMessage(agentId: string, message: Message)`: Saves a new message to the persistent storage.
- Use `this.ctx.storage.put` to ensure history survives DO restarts.

---

## 🏗️ Task 2: History Sync Endpoints (`apps/secure-agent-api`)
**File**: `src/index.ts`
**Instruction**:
- Add `GET /history?session={sessionId}&agentId={agentId}`: Fetches saved history.
- Add `POST /history?session={sessionId}&agentId={agentId}`: Upserts history chunks.

---

## 🏗️ Task 3: Brain-to-Muscle Persistence (`apps/brain`)
**File**: `src/controllers/ChatController.ts`
**Instruction**:
- Update the `streamText` logic. 
- Use the `onFinish` callback of the AI SDK to automatically send the final assistant message and tool results to the `SECURE_API` history endpoint.
- This ensures that even if the user closes the browser mid-stream, the data is saved in the DO.

---

## 🏗️ Task 4: Frontend Hydration Logic (`apps/web`)
**File**: `src/hooks/useChat.ts`
**Instruction**:
- Modify the `useChat` wrapper to accept an `initialMessages` parameter.
- Add a `useEffect` that triggers when the `agentId` changes:
    1. Fetch current history from `/api/history` (via proxy).
    2. Set the `initialMessages` in the AI SDK hook.
- Implement a "Loading State" so the UI shows a skeleton while the history is "Hydrating" from the Cloudflare Edge.

---

## 🏗️ Task 5: Global Agent Store (UI State Management)
**File**: `src/store/agentStore.ts` (New File or use Zustand)
**Instruction**:
- Create a central store to keep the `messages` of ALL active agents in memory.
- Instead of the `ChatInterface` owning the state, the `agentStore` owns it.
- When switching tabs, the UI just looks at a different key in the store's Map.

---

## 🚨 Standards & Safety
- **No `any`**: Strictly type the `Message` object using the AI SDK's `CoreMessage` or `UIMessage` types.
- **Concurrency**: Use `this.ctx.blockConcurrencyWhile` in the Durable Object to prevent history corruption during simultaneous agent executions.
- **Cleanup**: Implement a TTL (Time to Live) for history in the DO to prevent storage bloat.