This is the **"Shared Disk" Trap**. 

Even though you renamed the UI to "Active Tasks," the **Muscle (Cloudflare Sandbox)** is still just one single Linux environment. When Agent 1 creates `hello.py`, that file stays on the disk. When Agent 4 starts, it runs `ls`, sees `hello.py`, and the Brain (Gemini) thinks: *"Oh, I must have already started this. Let me show the user what's here."* This is why it "dumps" old content.

As your **Principal Architect**, we are going to implement **The Jailbreak Fix**. We must force the Agent into a sub-folder so it literally **cannot see** what other agents did.

---

### 🚩 Why it's dumping (The Technical Reason)
1.  **Global `ls`**: Your `list_files` tool is running in `/home/sandbox`.
2.  **State Persistence**: Your Durable Object is likely returning the "full history" instead of filtering by `runId`.
3.  **Brain Hallucination**: LLMs are designed to be helpful. If they see code, they explain it.

---

### 🛠️ The 3-Step "Clean Room" Fix

I am defining the **"Isolation Invariants"** to give to your agents.

#### 1. The Muscle: Folder Jailing (`apps/secure-agent-api`)
Every tool call **must** be prefixed with a path unique to that `runId`.
*   **Logic:** Instead of `/home/sandbox`, the agent works in `/home/sandbox/workspaces/${runId}`.
*   **Action:** If a tool runs and that folder doesn't exist, the Muscle **must** create it and `cd` into it before doing anything else. 

#### 2. The Brain: History Scoping (`apps/brain`)
The Brain is currently "drinking from a firehose."
*   **Logic:** When the Brain calls `SECURE_API.fetch('/history')`, the Muscle must return **ONLY** the messages where `runId === currentRunId`.
*   **Action:** We must stop passing a global "messages" array from the frontend. The Brain should fetch the *specific* run's history from the Durable Object.

#### 3. The Web: UI Purge (`apps/web`)
*   **Logic:** When you click "Agent 4," the message list in React must be **nuked** (set to `[]`) immediately before the new stream starts.
*   **Action:** Update `useChat.ts` to use a `key={activeRunId}` on the Chat component. This forces React to destroy the old chat and start a fresh one.

---

### 🚀 Message to give your Agent (The "Isolation" Command)

Copy and paste this to your logic agent. This will kill the "dumping" behavior for good.

```markdown
@GEMINI.md
@docs/architecture/isolation.md

# 🚨 URGENT: FIX CONTEXT LEAKAGE & DISK DUMPING

Agent tasks are bleeding into each other. Agent 4 sees Agent 1's files. Fix this immediately:

### 1. Muscle Isolation (apps/secure-agent-api)
- Modify `src/plugins/FileSystemPlugin.ts`. 
- Every tool (`list_files`, `write_file`) must accept a `runId`.
- **MANDATORY**: Prepend `/home/sandbox/workspaces/${runId}/` to all paths.
- If the directory does not exist, create it (mkdir -p) before the tool executes.
- This ensures a 'New Task' starts with an EMPTY file explorer.

### 2. Brain Scoping (apps/brain)
- In `ChatController.ts`, when fetching history from `SECURE_API`, pass the `runId`.
- Ensure the Muscle only returns messages belonging to that `runId`.
- If no history exists for that `runId`, the Brain must treat it as a brand-new conversation.

### 3. Frontend Component Key (apps/web)
- In `ChatInterface.tsx`, wrap the message mapping in a container with `key={activeRunId}`.
- This forces a clean UI state when switching tasks.

**Goal**: When I click 'New Task', I want to see an EMPTY File Explorer and NO previous messages.
```

---

### 🏁 Final CEO Advice:
The reason your agent is "blinking" (Screenshot 1) is that it's crashing because it's trying to process a massive "dump" of old data and hitting a timeout. 

**Isolation is the only way to move fast.** Once Agent 4 is in its own "Jail" (folder), it will be fast and responsive again because it has nothing to "remember" or "dump."

**Shall we execute the "Folder Jailing" now?** This is the foundation of a Multi-Agent system.