The initial Persistence Plan gave us "Memory," but as a **Senior Staff Engineer**, I can tell you it introduced four major **Architectural Bottlenecks** that will crash the system as soon as you have a real conversation.

### 🚩 The Bottlenecks in the Current Plan

1.  **The "Blob" Write Penalty:** In Task 1, we stored history as a `Map<string, Message[]>`. In Durable Objects, every time you `put` a large array, you rewrite the **entire blob**. When a chat hits 50+ messages, every single new message causes a massive, slow, and expensive write operation.
2.  **The "Context Dump" Death Spiral:** In Task 4, we "Hydrate" by sending the whole history to the Brain. LLMs (Gemini/Llama) lose focus when the context is full of raw tool results (like huge `ls` or `cat` outputs). You are paying for tokens you don't need.
3.  **The "Hydration Lag" UX:** If you wait for the server to return 100 messages every time you click an agent tab, the UI will feel "stuttery" and slow (not Cursor-like).
4.  **Serialization Mismatch:** `UIMessage` (frontend) and `CoreMessage` (backend) have different schemas. Saving them raw causes "Undefined" errors during hydration.

---

# 📄 `PERSISTENCE_REFINEMENT_PLAN.md`

## 🎯 Objective
Refine the persistence layer to be **Incremental, Pruned, and Optimistic.** 

---

## 🏗️ Task 1: Incremental Key-Value Storage (`apps/secure-agent-api`)
**Objective**: Stop saving the whole array. Save messages one-by-one.
- [ ] **Instruction**: Refactor `AgentRuntime.ts` to use hierarchical keys: `history:${agentId}:${timestamp}`.
- [ ] **Logic**:
    - Use `this.ctx.storage.list({ prefix: 'history:${agentId}' })` to fetch history.
    - This allows **Pagination** (only load the last 20 messages initially).
    - It makes writes O(1) instead of O(N).

---

## 🏗️ Task 2: The "Context Pruner" Helper (`packages/context-pruner`)
**Objective**: Strip "Technical Noise" before saving to the permanent record.
- [ ] **Instruction**: Create a shared utility that scans `tool_results`.
- [ ] **Logic**: 
    - If a `list_files` output is > 500 chars, replace it with `[Summary: 42 files found]`.
    - If a `read_file` output is > 2000 chars, store only the first/last 500 lines + a reference to the **R2 Artifact**.
- [ ] **Benefit**: Keeps the "Authoritative History" small and high-signal.

---

## 🏗️ Task 3: Optimistic Zustand Sync (`apps/web`)
**Objective**: Zero-lag agent switching.
- [ ] **Instruction**: Update `agentStore.ts` to implement an **Optimistic Cache**.
- [ ] **Logic**: 
    1. When switching to Agent 2: Show the messages already in the Zustand store **immediately**.
    2. In the background, fetch the "Latest" from the DO to check for updates (e.g., if a background task finished).
    3. Merge the background results silently.
- [ ] **Visual**: The user never sees a loading spinner when switching tabs.

---

## 🏗️ Task 4: The "Artifact Link" Pattern (Cold Storage)
**Objective**: Move large code blocks to R2 to keep the DO database lean.
- [ ] **Instruction**: In the `StorageService`, when saving a `create_code_artifact` message:
    1. Extract the code `content`.
    2. Upload it to Cloudflare R2: `artifacts/${sessionId}/${agentId}/${filename}.ts`.
    3. Replace the code in the DO message with a pointer: `{"type": "r2_ref", "key": "..."}`.
- [ ] **Frontend**: Update `ChatMessage.tsx` to detect `r2_ref` and fetch the code content on-demand.

---

## 🏗️ Task 5: Brain-Muscle "Heartbeat" Persistence
**Objective**: Save "In-Progress" thoughts so a refresh doesn't lose the "AI is typing" state.
- [ ] **Instruction**: In `ChatController.ts`, use the `onChunk` callback (Vercel SDK) to periodically update a "partial" message in the DO every 5 seconds.

---

### 🚀 Immediate Execution for your Agents:

**Step 1: The "Incremental Muscle" (Task 1)**
Give this to your **Muscle Agent**:
> "Read `code-rules.md`. Refactor the `AgentRuntime` storage logic. Stop using a single Map for history. Instead, use individual keys per message using the pattern `msg:${agentId}:${timestamp}`. Implement a `listMessages(agentId, limit)` method that uses `this.ctx.storage.list`."

**Step 2: The "Pruner" (Task 2)**
Give this to your **Logic Agent**:
> "Read `code-rules.md`. Create a new package `packages/context-pruner`. Implement a function `pruneToolResults(messages)` that truncates raw terminal/file outputs before they are sent to the storage service."

### 🏁 Final CEO Verdict:
By switching to **Incremental Writes** and **R2 Artifact Pointers**, we solve the latency problem. By adding **Optimistic Zustand Cache**, we solve the UX problem.

**Should we start with the Incremental Muscle update?** This is the foundation that prevents the Durable Object from slowing down as the project grows.