# 🧬 Shadowbox Task: Worktree Isolation Engine

## 📁 Context
- **Target App**: `apps/secure-agent-api` (The Muscle)
- **Current State**: All agents share the root filesystem. File collisions happen if multiple agents write simultaneously.
- **Goal**: Implement "Hub & Spoke" isolation using Git Worktrees.

---

## 🛠️ Implementation Plan

### 1. Create `WorktreeService` (New Service)
**File**: `apps/secure-agent-api/src/services/WorktreeService.ts`

Create a class `WorktreeService` with the following methods:

*   **`initBareRepo(repoUrl: string): Promise<string>`**
    *   Logic: Checks if `/home/sandbox/repo.git` exists. If not, runs `git clone --bare {repoUrl} /home/sandbox/repo.git`.
    *   Returns: The path to the bare repo.

*   **`createWorktree(runId: string, baseBranch: string): Promise<string>`**
    *   Logic:
        1. Define path: `/home/sandbox/runs/{runId}`.
        2. Run: `git worktree add -b run-{runId} /home/sandbox/runs/{runId} {baseBranch}`.
        3. Copy `node_modules` from root cache (if exists) to the new worktree to speed up install (Optional optimization).
    *   Returns: The absolute path to the new worktree.

*   **`cleanupWorktree(runId: string): Promise<void>`**
    *   Logic: Runs `git worktree remove /home/sandbox/runs/{runId} --force`.

### 2. Refactor `FileSystemPlugin`
**File**: `apps/secure-agent-api/src/plugins/FileSystemPlugin.ts`

Update the `execute` method signature and logic:

*   **Input**: Add `cwd` (Current Working Directory) to the payload schema.
*   **Safety Check**:
    *   If `cwd` is provided, ensure all file operations (`read`, `write`, `ls`) are prefixed with this path.
    *   **Crucial:** Validate that the resolved path does NOT escape the `cwd` (e.g. block `../../`).
*   **Logic**:
    *   `list_files`: Run `ls -F` inside the `cwd`.
    *   `write_file`: Write to `path.join(cwd, filepath)`.

### 3. Refactor `GitPlugin`
**File**: `apps/secure-agent-api/src/plugins/GitPlugin.ts`

*   Update logic to support running git commands inside a specific `cwd`.
*   Ensure `git status`, `git diff`, and `git commit` operate on the specific worktree, not the bare repo.

---

## 🚨 Constraints (Strict Compliance)
1.  **Parallel Safety**: Do **NOT** modify `AgentRuntime.ts` in this task (another agent is working there). Only build the Service and modify Plugins.
2.  **No `any`**: Define interfaces for `WorktreeConfig` and `ExecutionPayload`.
3.  **Error Handling**: If `git worktree add` fails (e.g., branch name conflict), catch the error and throw a clean `WorktreeException`.
