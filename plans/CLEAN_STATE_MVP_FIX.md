This is the **"Context Poisoning"** bug. It is the most common failure when building agentic systems.

### 🚩 Why this is happening (Founder-to-Founder)
Looking at your terminal logs, the AI is creating `hello.py`, `hello.js`, and `script.py` in **every single run**. 

1.  **Shared Filesystem:** Because you haven't implemented **Worktree Isolation** yet, Agent 4 sees the files Agent 1 created. It thinks: *"Oh, these files are here, I must have been in the middle of a task to create them,"* so it starts "finishing" or "repeating" those steps.
2.  **System Prompt Loop:** Your system prompt likely says "You are an expert engineer... write code." Without a specific task, the AI defaults to "demonstrating" its power by writing "Hello World" files.
3.  **Persistence Leak:** Your `ChatController` is likely fetching history from the *wrong* key or the Durable Object is returning a "global" history instead of one scoped strictly to the `runId`.

---

# 📄 `docs/plans/CLEAN_STATE_MVP_FIX.md`

## 🎯 Objective
Force a "Clean Room" start for every new task and implement the "Jobs Sidebar" to manage multiple isolated worktrees.

## 🏗️ 1. The "Zero-State" UI (Cockpit)
**File**: `apps/web/src/components/chat/ChatInterface.tsx`
- **Logic**: If `activeRunId` is null, show a **"New Task"** landing page (exactly like `cursor.com/agents`).
- **Visual**: A large, centered command bar. "What should Shadowbox build today?"
- **Action**: Entering a command here generates a new `UUID` for `runId` and switches the UI to the "Job View."

## 🏗️ 2. The "Jobs" Sidebar (The Manager)
**File**: `apps/web/src/components/layout/AgentSidebar.tsx`
- **Logic**: Instead of a list of "Agents," show a list of **"Active Tasks."**
- **Data**: Each item shows: `[Run Name] | [Status: Running/Idle]`.
- **Switching**: Clicking an item updates the `activeRunId` in the Zustand store.

## 🏗️ 3. Physical Folder Isolation (The "Muscle")
**File**: `apps/secure-agent-api/src/plugins/FileSystemPlugin.ts`
- **CRITICAL**: Every new `runId` **MUST** have its own folder.
- **Logic**: Prepend `/home/sandbox/runs/${runId}/` to every file operation. 
- **Result**: Agent 4 will see an **empty directory** and will be forced to listen to your *new* query rather than yapping about old files.

## 🏗️ 4. Reactive System Prompt (The "Brain")
**File**: `apps/brain/src/controllers/ChatController.ts`
- **Update**: "You are a reactive engineer. DO NOT write any code or run any tools unless specifically instructed by the current user message. Do not repeat previous successes."

---

# 🚀 Message to give your Agent (The "Pivot to Pro" Command)

Copy and paste this into your coding agent. This will clear the loops and fix the UI.

```markdown
@GEMINI.md
@docs/architecture/overview.md

# 🚨 TASK: IMPLEMENT CLEAN START & JOB ISOLATION

We are currently stuck in a "Context Loop." Agents are repeating old tasks. We need to implement the "Airlock" isolation pattern immediately.

### 1. The Landing Page (Web)
In `apps/web/src/App.tsx` and `ChatInterface.tsx`:
- Create a 'New Task' view. If no task is active, show a centered input box.
- When the user submits, generate a `runId` (UUID) and add it to the `agentStore`.

### 2. The "Runs" Sidebar (Web)
In `apps/web/src/components/layout/AgentSidebar.tsx`:
- Render the list of `runs` from the Zustand store.
- Each run should be a link that sets the `activeRunId`.

### 3. Absolute Filesystem Isolation (Muscle)
In `apps/secure-agent-api/src/plugins/FileSystemPlugin.ts`:
- Refactor all methods (`list_files`, `write_file`, `read_file`).
- They MUST require a `runId`.
- Force the base path to be `/home/sandbox/workspaces/${runId}`.
- If the folder doesn't exist, create it. **Never let an agent see the root sandbox folder.**

### 4. Fix Persistence Fetch (Brain)
In `apps/brain/src/controllers/ChatController.ts`:
- Ensure `SECURE_API.fetch('/history')` uses the `runId` as a query parameter.
- If the history returned is empty, skip all 'Hydration/Pruning' logs and start a fresh conversation.

**Goal**: When I click 'New Task' and type 'hello', I should see an EMPTY file explorer and the agent should only say 'Hello! How can I help you today?' without writing 10 files.
```

---

### 🏁 Final Senior Advice:
The reason your app "dumps" everything is that it's **too eager**. By forcing the filesystem to be empty for "Agent 4," you remove the "Trigger" that causes the AI to start yapping.

**Shall we run this "Job Isolation" task now?** This is the exact moment Shadowbox stops being a "Chatbot" and becomes an "Agent Environment."