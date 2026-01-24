# 📦 Shadowbox: The Unified Task List

## ✅ Phase 1: Core Engine Foundation
- [x] **Sandbox Integration**: Initialize Cloudflare Sandbox SDK.
- [x] **Stateful Sessions**: Implement Durable Objects to prevent "Goldfish Memory."
- [x] **Basic Runtime**: Secure execution of Python code via HTTP POST.
- [x] **Type Safety**: Establish strict TypeScript interfaces for execution requests.

## ✅ Phase 2: Plugin Architecture (SOLID Principles)
- [x] **Strategy Pattern**: Refactor core into a modular Plugin System.
- [x] **Sidecar Support**: Implement background service management (Go-Redis).
- [x] **Custom Binaries**: Compile and run custom Go-RESP server inside the sandbox.
- [x] **Hybrid Execution**: Enable Python scripts to communicate with Go sidecars via localhost.

## ✅ Phase 3: Real-time Infrastructure & Discovery
- [x] **WebSocket Streaming**: Implement `StreamHandler` for live logs (stdout/stderr).
- [x] **Tool Discovery**: Build `GET /tools` to auto-generate OpenAI-compatible JSON schemas.
- [x] **FileSystem Plugin**: Add `ls`, `cat`, and `mkdir` capabilities.
- [x] **Git Plugin**: Enable cloning public repositories for agent analysis.
- [x] **Monorepo Migration**: Structure project using Turborepo and pnpm workspaces.

## ✅ Phase 3.5: Infrastructure & Sync (CURRENT)
- [ ] **Optimized Dockerfile**: Multi-stage build for Python, Node, Rust, and Go-Redis.
- [ ] **Clean API Entrypoint**: Implement CORS and robust routing in `index.ts`.
- [ ] **Command Processor**: Refactor Terminal logic to be SOLID (Strategy Pattern).
- [ ] **OSS Sync Action**: Automate folder sync to `agent-runtime-cf`.

## 🚀 Phase 4: The "multi agent" Experience
- [ ] **LLM Gateway**: Add `/chat` endpoint to bridge UI prompts to Sandbox tools.
- [ ] **Git Workflow**: Implement `git_diff`, `git_commit`, and `git_push`.
- [ ] **Task UI**: side-by-side Terminal (Logs) and Diff View (Changes).

## 🚀 Phase 4.5: Productization (The "multi agent" Experience)
- [ ] **Multi-Session UI**: Refactor React frontend to support multiple terminal tabs/agents.
- [ ] **Dynamic Layout**: Implement a dashboard with a sidebar and main execution area.
- [ ] **Visual File Explorer**: Create a UI tree-view that syncs with the Sandbox filesystem.
- [ ] **System Monitor**: Add real-time stats (Session ID, Uptime, Connected Status).

## 🔒 Phase 5: The "Airlock" & Security
- [ ] **Secure Mode Toggle**: Implement the UI switch to redirect local commands to Cloudflare.
- [ ] **Secrets Management**: Build a secure vault for API keys (`OPENAI_API_KEY`) via `EnvPlugin`.
- [ ] **Auth Layer**: Basic session protection using Cloudflare Access or API Tokens.

## 🌍 Phase 6: Launch & Marketing
- [ ] **Cloudflare Pages**: Deploy the frontend to `shadowbox.sh` (or similar).
- [ ] **Astro Landing Page**: Create high-conversion marketing site at `apps/www`.
- [ ] **OSS Polish**: Finalize README, License, and Contribution guides.
- [ ] **Build in Public**: Record a demo video showing the "Hybrid Go+Python" speed.

## 🛠 Phase 7: The Bridge (Future)
- [ ] **Local CLI**: Build `apps/cli` to allow `npx shadowbox` to sync local files to the sandbox.