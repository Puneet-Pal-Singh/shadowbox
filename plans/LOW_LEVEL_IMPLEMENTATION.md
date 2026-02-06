# 🛠️ Shadowbox Web: Engineering Specification (v2)

## 1. Persistence Engine (The Source of Truth)
**Objective:** Store chat history reliably using an Append-Only model.

### Backend (`apps/secure-agent-api`)
- **Storage Schema**: 
  - Keys: `chat:${runId}` (List of Messages)
  - Metadata: `run:${runId}` (Status, Worktree Path, CreatedAt)
- **Logic**: 
  - **Append-Only**: Never mutate old messages. Only `push` new ones.
  - **Durable Object**: Use `blockConcurrencyWhile` to ensure message order is guaranteed during streams.

### Frontend (`apps/web`)
- **Store**: `useAgentStore` (Zustand).
  - Tracks: `activeRunId`, `runs: Record<runId, RunMetadata>`.
- **Hydration**: 
  - On `activeRunId` change -> Fetch `/chat/:runId`.
  - Render skeleton while fetching.

---

## 2. Isolation Engine (Git Worktrees)
**Objective:** Allow multiple agents to edit the same repo without conflicts.

### Backend (`apps/secure-agent-api`)
- **Worktree Manager**:
  - `createWorktree(runId, baseBranch)`: 
    - Command: `git worktree add -b run-{runId} ../runs/{runId} {baseBranch}`.
    - Returns: `/home/sandbox/runs/{runId}`.
  - `cleanupWorktree(runId)`:
    - Command: `git worktree remove ../runs/{runId} --force`.
    - Triggered on: Session End or explicit "Delete Agent".
- **Runtime Injection**:
  - Inject `cwd` (Current Working Directory) into every tool execution based on the active `runId`.

---

## 3. UI Refactor (The View Layer)
**Objective:** Visualize the "Runs" and "Artifacts".

### Components
- **`Sidebar.tsx`**: 
  - Iterate through `runs`. Show status icons (🟢 Running, ⚪️ Idle).
- **`ArtifactView.tsx`**:
  - Use `@monaco-editor/react`.
  - **Constraint**: Read-Only mode for MVP v1. 
- **`ChatInterface.tsx`**:
  - Strictly tied to `activeRunId`. 
  - No local state for messages. All messages come from the Store/Backend.

---

## 4. Execution Order (The Critical Path)

1.  **Persistence (Backend & Frontend)**: 
    - Implement `ChatStorage` in DO.
    - Implement `useAgentStore` in Web.
    - *Result:* You can refresh the page, and the chat is still there.

2.  **Isolation (Backend)**:
    - Implement `GitWorktree` logic in `GitPlugin`.
    - Update `FileSystemPlugin` to respect `cwd`.
    - *Result:* Agent A cannot see Agent B's files.

3.  **UI Polish (Frontend)**:
    - Implement Sidebar and Monaco.
    - *Result:* It looks like a pro tool.

4.  **Cleanup (Backend)**:
    - Implement `cleanupWorktree`.
    - *Result:* Sandbox disk doesn't fill up.