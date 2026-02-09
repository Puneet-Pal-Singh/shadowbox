Perfect. I’ll lay this out like a **platform roadmap**, not a feature checklist — something you could literally paste into a design doc, README, or YC application.

I’ll keep it **high-level**, **ordered**, **vendor-neutral**, and explicitly show **where Cloudflare fits without locking you in**, and how this scales to **Web → CLI → Desktop**.

---

# Shadowbox Roadmap

**From current state → Repo-aware multi-agent platform**

You already have **Execution + Isolation**.
Now we add **Intelligence + Control + Scale**.

---

## 🧱 PHASE 0 — What You Already Have (Baseline)

This is your foundation. Don’t touch it unless necessary.

* Run-scoped isolation (`runId → worktree → sandbox`)
* Tool-based repo access (read/write/diff)
* Brain / Muscle split
* Durable history
* GitHub OAuth, repo & branch selection
* Observability in UI (tool calls, diffs)

This maps cleanly to **Codex’s execution layer**.

---

## 🧠 PHASE 1 — Context Assembly Engine (MOST IMPORTANT)

> This is the “Codex secret sauce”. Everything else builds on this.

### 1️⃣ Introduce a **ContextBuilder** (new platform primitive)

**Responsibility**
Given:

* `runId`
* user message
* repo metadata

Return:

* a **curated context payload** for the LLM

**This must live in the Brain and be cloud-agnostic.**

#### Inputs

* User intent
* Repo metadata (name, branch)
* Git state (changed files)
* Chat history (raw + summarized)

#### Outputs

* System prompt
* Selected files (paths + contents)
* Selected diffs
* Summarized history
* Token budget report

---

### 2️⃣ Intent Classification (lightweight, not fancy)

Before any tool call:

```
User Message
→ classifyIntent()
→ ContextBuilder strategy
```

Example intents:

* explore
* bugfix
* refactor
* implement
* review

This can be:

* heuristic first
* LLM-assisted later

---

### 3️⃣ Repo Awareness Bootstrap (cheap but powerful)

Inject **minimal repo context upfront**, without reading files:

* repo name
* branch
* top-level tree (depth 1–2)
* recent diffs (if any)

This alone massively improves agent behavior.

---

### 4️⃣ Token Budgeting (hard rule, not best effort)

Add a **TokenPolicy** module:

* soft limit (planning)
* hard limit (enforced)
* drop order:

  1. old chat
  2. large files
  3. verbose diffs
* summarization fallback

No provider should ever error due to context overflow.

---

### CF Integration (non-locking)

* **None required here**
* This layer must be 100% portable
* Same code used by:

  * Web
  * CLI
  * Desktop

---

## 🔁 PHASE 2 — Orchestration & Planning Layer

Right now you’re reactive. This adds *intentionality*.

### 5️⃣ Explicit Planning Step

New agent loop:

```
Context → Plan → Execute → Observe → Decide
```

Plan is:

* short-lived
* hidden by default
* structured (steps, files)

This can be a single LLM call.

---

### 6️⃣ Deterministic Stop Conditions

Replace “LLM decides to stop” with:

* goal satisfied
* no new diffs
* token budget exhausted
* max iterations hit

This prevents infinite loops and runaway cost.

---

### CF Integration

* **Cloudflare Agents SDK**

  * Use it as *runtime glue*, not intelligence
  * Your logic stays outside

Vendor-neutral because:

* Planning logic is yours
* Agents SDK is replaceable

---

## 🧩 PHASE 3 — Multi-Agent Architecture (Careful, Controlled)

Do **not** jump to many agents immediately.

### 7️⃣ Define Agent Roles (not instances)

Examples:

* RepoExplorer (read-only)
* CodeWriter (write)
* Reviewer (read-only)
* TestRunner (execute)

Each role has:

* allowed tools
* token budget
* write permissions

---

### 8️⃣ Supervisor Model (thin, cheap)

Supervisor responsibilities:

* spawn agents
* pass bounded context
* merge results

No “agents talking to agents” chaos.

---

### CF Integration

* **Durable Objects** or **Agents SDK**

  * Acts as run-scoped coordinator
* Replaceable later with:

  * Redis + Postgres
  * Actor frameworks

---

## 🧠 PHASE 4 — Memory & Persistence (Codex-level polish)

### 9️⃣ Memory Types (separate explicitly)

* **Short-term**: current run (chat)
* **Mid-term**: summarized decisions
* **Long-term**: repo facts (optional, future)

Summaries are first-class artifacts.

---

### 10️⃣ Replay & Resume Semantics

Add:

* replay tool calls
* reconstruct context from artifacts + summaries

This enables:

* debugging
* demos
* CI-like flows later

---

### CF Integration

* **R2** for:

  * summaries
  * diffs
  * artifacts
* **R2 Local Uploads** for zero-cost dev

S3-compatible → no lock-in.

---

## 🔐 PHASE 5 — Safety, Control & UX Trust

### 11️⃣ Write Approval Mode (v1 simple)

Modes:

* auto-apply
* show diff → apply
* dry-run only

This is essential for trust.

---

### 12️⃣ Permissioned Tools

Enforce:

* read-only agents
* write-only with approval
* no shell by default

This matters for enterprise + OSS credibility.

---

## ⏱️ PHASE 6 — Long-Running & Autonomous Tasks

### 13️⃣ Background Tasks & Pausing

Use when:

* large refactors
* tests
* deep repo scans

---

### CF Integration

* **Cloudflare Workflows**

  * pause / resume
  * no idle compute
  * Temporal-like semantics

Replaceable later with:

* Temporal
* Inngest

---

## 🌍 PHASE 7 — Platform Unification (Web → CLI → Desktop)

### 14️⃣ Backend as a Platform

Everything above lives in:

* Brain APIs
* Muscle APIs
* Shared schemas

Frontend becomes a **client**, not logic holder.

---

### 15️⃣ Thin Clients

* Web: React
* CLI: Node / Go
* Desktop: Tauri / Electron

All use:

* same context builder
* same orchestration
* same sandbox interface

---

## 🔁 Cloudflare Usage Summary (Non-Locking)

| CF Service      | Role             | Lock-in Level        |
| --------------- | ---------------- | -------------------- |
| Sandbox         | Secure execution | Medium (operational) |
| R2              | Artifacts        | Low                  |
| Durable Objects | Coordination     | Medium               |
| Agents SDK      | Runtime glue     | Low                  |
| Workflows       | Long tasks       | Low                  |

All business logic remains **platform-agnostic**.

---

## Final perspective (important)

You are **exactly at the right inflection point**.

* Don’t add more UI yet
* Don’t add more agents yet
* Don’t optimize infra yet

👉 **Context → Planning → Control** is the winning order.

If you want, next we can:

* break **Phase 1** into concrete subtasks
* design the **ContextBuilder API**
* or define **Repo-Aware Agent v1 acceptance criteria**

Say where you want to zoom in.
