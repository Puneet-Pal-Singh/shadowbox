Perfect. Freezing this now will save you *weeks* later.

Below are **FINAL, vendor-neutral interfaces** for
**PHASE 1 — Context Assembly Engine**
These are **platform primitives**, not implementations.

Think: *Codex / Cursor / Devin-class systems*.

---

# PHASE 1 — Context Assembly (FINAL Interfaces)

## Design Principles (Non-Negotiable)

* **Vendor-neutral** (Cloudflare, Node, CLI, Desktop all plug in)
* **Pure & deterministic** (same inputs → same context)
* **Repo-aware, tool-aware, agent-aware**
* **Composable** (multi-agent future)
* **Token-budgeted by construction**

---

## 1️⃣ Core Primitive: `ContextBuilder`

> Single responsibility:
> **Convert raw world state → LLM-ready context**

```ts
export interface ContextBuilder {
  build(input: ContextBuildInput): Promise<ContextBundle>
}
```

No side effects
No network
No tool execution

---

## 2️⃣ Context Inputs

### `ContextBuildInput`

```ts
export interface ContextBuildInput {
  runId: string

  goal: UserGoal

  agent: AgentDescriptor

  repo?: RepoSnapshot

  memory?: MemorySnapshot

  recentEvents?: RuntimeEvent[]

  constraints: ContextConstraints
}
```

---

### `UserGoal`

```ts
export interface UserGoal {
  raw: string               // User message
  normalized?: string       // Optional rewritten goal
}
```

---

### `AgentDescriptor`

```ts
export interface AgentDescriptor {
  id: string
  role: 'planner' | 'coder' | 'reviewer' | 'executor' | 'generic'

  capabilities: AgentCapability[]
}
```

```ts
export type AgentCapability =
  | 'read_files'
  | 'write_files'
  | 'git'
  | 'run_tests'
  | 'search'
```

---

## 3️⃣ Repo Awareness (Read-only)

### `RepoSnapshot`

> **Important:** ContextBuilder never touches filesystem directly.

```ts
export interface RepoSnapshot {
  root: string

  files: FileDescriptor[]

  symbols?: SymbolIndex[]

  diffs?: GitDiff[]

  metadata?: RepoMetadata
}
```

---

### `FileDescriptor`

```ts
export interface FileDescriptor {
  path: string
  size: number
  language?: string
  lastModified?: number
}
```

---

### `SymbolIndex` (optional but future-critical)

```ts
export interface SymbolIndex {
  name: string
  kind: 'function' | 'class' | 'type' | 'variable'
  file: string
  range: [number, number]
}
```

---

### `GitDiff`

```ts
export interface GitDiff {
  file: string
  patch: string
}
```

---

## 4️⃣ Memory (Durable / Portable)

```ts
export interface MemorySnapshot {
  summaries?: MemoryChunk[]
  pinned?: MemoryChunk[]
  recent?: MemoryChunk[]
}
```

```ts
export interface MemoryChunk {
  id: string
  content: string
  importance: number // 0–1
}
```

Works with:

* Durable Objects
* Redis
* SQLite
* JSON files

---

## 5️⃣ Runtime Signals

```ts
export interface RuntimeEvent {
  type:
    | 'tool_call'
    | 'tool_error'
    | 'execution_result'
    | 'user_interruption'

  payload: unknown
}
```

Used for:

* Retry reasoning
* Failure context
* Supervisor agents later

---

## 6️⃣ Constraints & Budgets

### `ContextConstraints`

```ts
export interface ContextConstraints {
  maxTokens: number

  strategy:
    | 'greedy'
    | 'balanced'
    | 'conservative'

  allowSummarization: boolean
}
```

---

## 7️⃣ Output: `ContextBundle`

This is the **ONLY thing** LLM sees.

```ts
export interface ContextBundle {
  system: string

  messages: ContextMessage[]

  tools: ToolDescriptor[]

  tokenEstimate: number

  debug?: ContextDebugInfo
}
```

---

### `ContextMessage`

```ts
export interface ContextMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
}
```

---

## 8️⃣ Tool Exposure (Critical for Safety)

```ts
export interface ToolDescriptor {
  name: string
  description: string
  schema: unknown // Zod / JSON Schema / TypeBox
}
```

ContextBuilder **filters tools** based on:

* agent role
* repo state
* phase

---

## 9️⃣ Debugging & Observability (Optional but gold)

```ts
export interface ContextDebugInfo {
  includedFiles: string[]
  excludedFiles: string[]
  droppedMessages: number
  summarizationsApplied: number
}
```

---

## 🔒 Hard Invariants (Agents must respect)

1. ContextBuilder **does NOT** call tools
2. ContextBuilder **does NOT** read filesystem
3. ContextBuilder **does NOT** mutate memory
4. ContextBuilder **ONLY assembles**
5. Deterministic output per input

---

## Why this survives scale

✔ Works in **Cloudflare Workers**
✔ Works in **Node / Bun**
✔ Works in **CLI**
✔ Works in **Desktop (Tauri/Electron)**
✔ Works with **Cloudflare Agents SDK**
✔ Works with **LangGraph / Temporal / Workflows**

---

## What you give to agents now

You can safely give **this entire spec** to Gemini agent and say:

> “Implement Phase 1 — Context Assembly Engine using these frozen interfaces. No design changes allowed.”

They will not brick your architecture.

---

## Next natural step (when you’re ready)

* Phase 1️⃣ Task 2: **Context Sources (File, Diff, Memory, Symbol)**
* Phase 1️⃣ Task 3: **Scoring + Ranking**
* Phase 1️⃣ Task 4: **Token Packing Algorithm**

But don’t rush.
This was the hardest part — and you did it right. 💪
