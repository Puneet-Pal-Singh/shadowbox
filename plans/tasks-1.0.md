# 📦 Shadowbox: The Open-Source Agent Platform

**Vision:** A secure, cloud-native alternative to Blackbox.ai and Cursor Agents.
**Stack:** Cloudflare Workers (Brain) + Durable Objects (Runtime) + React/Vite (UI).

---

## ✅ Completed Phases (Foundation)
- [x] **Monorepo Setup**: Turborepo + pnpm workspaces structure (`apps/`, `packages/`).
- [x] **Secure Runtime Engine**: `apps/secure-agent-api` with Durable Objects & Sandbox SDK.
- [x] **Polyglot Execution**: Dockerized runtime with Python, Node.js, Rust, and Go-Redis.
- [x] **Real-time Streaming**: WebSocket implementation for live logs.
- [x] **Plugin Architecture**: Modular system for Git, FileSystem, and Code Runners.
- [x] **Visual Terminal**: Xterm.js integration with "Cyberpunk" styling.
- [x] **Multi-Session Manager**: Tabbed interface for running parallel agents.
- [x] **File Explorer**: Visual directory tree syncing with the sandbox.

---

## 🧠 Phase 5: Intelligent Orchestration (The Brain)
*Goal: Create the reasoning layer that translates user intent into runtime commands.*

- [ ] **Brain Worker Setup**: Initialize `apps/brain` with Cloudflare Workers AI bindings.
- [ ] **Provider Pattern**: Create `AIProvider` interface to support multiple LLMs.
- [ ] **Anthropic Integration**: Implement `AnthropicProvider` for Claude 4.5 Sonnet (Tool Calling).
- [ ] **Cloudflare AI Integration**: Implement `CloudflareProvider` for free models (Llama-3).
- [ ] **Tool Discovery Bridge**: Connect `apps/brain` to `apps/secure-agent-api` via Service Bindings to fetch available tools dynamically.
- [ ] **Chat API Endpoint**: Build `POST /chat` that accepts prompts + API keys and returns structured tool calls.

---

## 💬 Phase 6: The "Agentic" UI (Frontend 2.0)
*Goal: Shift from "Terminal-First" to "Chat-First" UX (like Cursor).*

- [ ] **Chat Interface**: Build a split-pane view (Chat on Left, Terminal/Preview on Right).
- [ ] **Message Stream**: Render user prompts and AI responses with "Thinking" states.
- [ ] **Artifact Renderer**: If AI generates code, show it in a syntax-highlighted block (not just raw text).
- [ ] **Settings Modal**: UI for users to input their own API Keys (BYOK - Bring Your Own Key) securely.
- [ ] **Auto-Executor**: Logic to take the Brain's "Tool Calls" and automatically send them to the `TerminalController`.

---

## 🛠 Phase 7: The "Dev" Workflow (Verification)
*Goal: Trust but Verify. Give users control over git operations.*

- [ ] **Git Diff View**: Integrate `react-diff-view` to show changes before committing.
- [ ] **PR Workflow**: UI button to "Create Pull Request" after agent finishes task.
- [ ] **Context Awareness**: Ability to "@mention" files in chat (sending file contents to the Brain).

---

## 🚀 Phase 8: Launch Prep
- [ ] **Domain Setup**: Purchase/Connect domain (or `shadowbox.sh`).
- [ ] **Landing Page**: Deploy `apps/www` (Astro) with feature breakdown.
- [ ] **Documentation**: Write a solid `README.md` explaining how to self-host.