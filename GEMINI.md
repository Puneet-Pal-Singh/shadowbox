# 📄 `GEMINI.md`

# 🧬 Shadowbox Engineering Constitution

This document defines **non-negotiable architectural invariants, coding standards, and workflows**.
All agents and contributors must comply with this constitution.

---

## 1. System Architecture (The Mental Model)

Shadowbox is a **web-native, multi-agent IDE** built on Cloudflare primitives.

### System Roles (Separation of Concerns)
*   **CORE PROTECTION:** Never modify low-level kernel files (e.g., `apps/secure-agent-api/src/core`, `apps/brain/src/index.ts`) unless explicitly instructed.
*   **Brain (`apps/brain`)**
    *   **Tech**: Workers + Vercel AI SDK.
    *   **Role**: Logic, Prompt Assembly, Tool Selection.
    *   **Restriction**: Does **NOT** execute code or touch the filesystem directly.
*   **Muscle (`apps/secure-agent-api`)**
    *   **Tech**: Durable Objects + Cloudflare Sandbox.
    *   **Role**: Code Execution, Git Operations, Filesystem, State Storage.
    *   **Status**: The **Single Source of Truth** for execution.
*   **Web (`apps/web`)**
    *   **Tech**: Vite + React 19 + Tailwind v4.
    *   **Role**: UI/UX, Visualization.
    *   **Status**: **Stateless**. Hydrates data from the Muscle/Brain.

---

## 2. Execution & Data Model (Strict Invariants)

### The "AgentRun" Primitive
*   **`runId` is the ONLY execution identifier.**
*   Do NOT use `session`, `agent`, or `thread` semantics for execution logic.
*   All state, filesystem operations, and history are scoped to a `runId`.

### Persistence Strategy
*   **Location**: Durable Object storage (`this.ctx.storage`).
*   **Key Format**: `chat:${runId}`.
*   **Append-Only**: Never mutate prior messages. Only push new ones.
*   **Concurrency**: All write operations MUST be wrapped in `blockConcurrencyWhile`.

### Isolation Strategy
*   **Git Worktrees**: Every `runId` maps to exactly one Git worktree.
*   **Path**: `/home/sandbox/runs/{runId}`.
*   **Rule**: Agents must **never** share a working directory or write to the sandbox root.

---

## 3. Coding Standards (The "Big Four")

### S.O.L.I.D. & Pattern Discipline
*   **S (Single Responsibility)**: One file = One purpose.
*   **Service Pattern**: Business logic goes in `src/services/`. External API calls (Google, Groq, Sandbox) MUST be wrapped in a Service with proper error handling.
*   **Adapter Pattern**: Wrap external SDKs (AI SDK, Git) so they can be swapped.
*   **Helper Pattern**: Do not put logic in React components or Worker fetch handlers. Extract to `src/lib`.
*   **Composition**: Favor composition over inheritance. Depend on abstractions, not concretions.

### Strict Type Safety
*   **NO `any` TYPE**: Use of `any` is a build failure. Use `unknown` with narrowing if necessary.
*   **Zod Validation**: All tool inputs and API bodies must be validated via `zod`.
*   **Discriminated Unions**: Use them for state (e.g., `status: 'idle' | 'running' | 'failed'`).

### D.R.Y. & K.I.S.S.
*   **No God Objects**: If a function exceeds 50 lines, refactor it.
*   **Shared Types**: Define interfaces in `packages/shared-types` if used across apps.

---

## 4. Git & Workflow Protocol

### Branching Strategy
*   **Feature Branches**: Always create a branch for a task. Format: `feat/persistence-engine`, `fix/cors-headers`.
*   **No Direct Push**: Never push directly to `main` without verification.

### Commit Standards
*   **Conventional Commits**: Use prefixes: `feat:`, `fix:`, `chore:`, `refactor:`.
*   **Atomic Commits**: One logical change per commit. Do not bundle a UI fix with a backend refactor.
* Dont commit plans/ folder

### "Plan-First" Workflow
1.  **Read Docs**: Before writing code, check `docs/plans/` for architectural context.
2.  **Update Plans**: If implementation details change, update the `.md` file in `docs/plans/` first.
3.  **Safety Check**: Never commit `.dev.vars`, `.env`, or API keys.

---

## 5. Critical Runtime Constraints (Must-Enforce)

### Filesystem Safety
*   **Jail Execution**: All file operations must be scoped to `cwd`.
*   **Path Traversal**: Validate paths to prevent `../../` escapes.

### Network & Streaming
*   **CORS**: All responses from Brain/Muscle must include `CORS_HEADERS`.
*   **Streaming**: Use `toDataStreamResponse` (Vercel AI SDK standard). Never buffer full LLM responses.
*   **Event-Driven UI**: Use `window.dispatchEvent` or WebSockets to sync state between Sandbox and Web. Do not poll.

---

## 6. Review Checklist (Self-Correction)

Before declaring a task complete, the Agent must verify:
1.  Did I use `any`? (If yes, fix it).
2.  Did I put logic in a Controller/Component instead of a Service? (If yes, move it).
3.  Did I respect the `runId` isolation?
4.  Did I update the relevant documentation?
5.  Is there a simpler way to achieve this (KISS)?

---