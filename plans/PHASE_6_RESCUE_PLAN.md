The reason we are struggling is that we are trying to fix a **broken engine** by painting the dashboard. 

The error in your log: `TypeError: Cannot read properties of undefined (reading 'map')` at `pruneToolResults` is the reason the AI is "dumping" and then "blinking." The background process is crashing mid-stream, leaving the UI in a corrupted state.

As your **Principal Architect**, here is the **Emergency Rescue Plan** to stop the loops and fix the isolation.

---

### 📄 FILE: `docs/plans/PHASE_6_RESCUE_PLAN.md`

```markdown
# 🚨 Shadowbox Rescue: Critical Loop & Isolation Fix

## 🎯 Goal
1. Stop the `pruneToolResults` crash.
2. Force every new Agent to start a clean `AgentRun` in a fresh directory.
3. Fix the "Context Dump" by simplifying the Orchestrator.

---

## 🏗️ 1. Fix the Pruner Crash (Immediate)
**File**: `packages/context-pruner/src/index.ts`
- **Issue**: The function is receiving `undefined` instead of an array.
- **Fix**: Add a null-check guard.
  ```typescript
  export function pruneToolResults(messages: any[] | undefined) {
    if (!messages || !Array.isArray(messages)) return [];
    return messages.map(msg => { ... });
  }
  ```

## 🏗️ 2. The "New Task" Protocol (Web UI)
**File**: `apps/web/src/hooks/useChat.ts`
- **Issue**: The app reuses the same state for every tab.
- **Fix**: When a user clicks "+", generate a brand new `runId` (UUID). 
- **Action**: Ensure the File Explorer and Chat are keyed by this `runId`.

## 🏗️ 3. Physical Isolation (The "Muscle")
**File**: `apps/secure-agent-api/src/plugins/FileSystemPlugin.ts`
- **Issue**: All agents see the same files because they all work in `/home/sandbox`.
- **Fix**: 
  1. Every `runId` must operate in `/home/sandbox/workspaces/{runId}`.
  2. If the directory doesn't exist, create it before any tool runs.
  3. Prepend the `runId` path to all `ls` and `write_file` commands.

## 🏗️ 4. Stop the AI "Yapping" & Dumping
**File**: `apps/brain/src/controllers/ChatController.ts`
- **Logic**: If history is empty (new run), DO NOT try to prune or hydrate. Just send the user prompt.
- **System Prompt**: Add "You are starting a fresh task. Do not refer to previous work unless it is in the current directory."
```

---

### 🚀 Message to give your Agent (The "Fix-It" Command)

Copy and paste this to your logic agent immediately. **This is the one command that stops the bleeding.**

```markdown
@GEMINI.md
@docs/architecture/isolation-model.md

# 🚨 CRITICAL FIX REQUIRED: STOP THE LOOP

We have a "Feedback Loop Collapse." The pruner is crashing, and agents are sharing the same folder. Follow these steps exactly:

### 1. Fix the Crash
In `packages/context-pruner/src/index.ts`, add a guard to `pruneToolResults` to ensure it never reads `.map()` on an undefined or empty variable. Return an empty array if input is invalid.

### 2. Implement "Fresh Start" Logic
In `apps/brain/src/controllers/ChatController.ts`:
- Check if `messages` array is empty. If it is, skip all pruning/hydration logic.
- Ensure `onFinish` uses `finalResult.response.messages` to save history. Wrap it in a try/catch so it never crashes the main stream.

### 3. Enforce Folder Isolation
In `apps/secure-agent-api/src/plugins/FileSystemPlugin.ts`:
- Modify every action (`list_files`, `write_file`, `read_file`).
- They MUST take the `runId` from the payload.
- All paths must be relative to `/home/sandbox/workspaces/${runId}`.
- Create this directory automatically if it doesn't exist before executing the tool.

### 4. UI Reset
In `apps/web/src/hooks/useChat.ts`, ensure that `setMessages` is called with an empty array immediately when a new `runId` is detected.

**Goal**: I want to open "Agent 2," see an empty file explorer, and get a direct answer to my query without a code dump.
```

---

### 🏁 Why we are failing (Founder-to-Founder)
We are failing because we are asking the AI to "Refine Context" while the **Filesystem is still a mess.** 

The AI is seeing the files from "Agent 1" while it is supposed to be "Agent 2." It gets confused and thinks it needs to "re-write" or "re-list" them. 

**Isolation is the cure.** Once Agent 2 has a truly empty folder, it will have nothing to "dump," and it will be forced to actually listen to your command. 

**Shall we run the "Fix-It" command now?** It will clean up the code and the filesystem in one go.