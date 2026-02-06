# 🚀 shadowbox Web: Strategic Roadmap to MVP (Refined)

## 🎯 Vision
A web-native, multi-agent coding workspace that utilizes Cloudflare Durable Objects for state and Git Worktrees for isolation. 
Target quality: Cursor Agents / Blackbox Cloud.

## 📦 Phase 1: The "Unbreakable" Engine (Core Runtime)
**Goal:** A robust backend where agents have memory and never overwrite each other.
- [ ] **Persistence:** Fix "Amnesia." Agents remember history across reloads. (Append-Only Architecture).
- [ ] **Isolation:** Implement Hub & Spoke Git Worktrees. One Agent = One Worktree.
- [ ] **Lifecycle:** Ensure worktrees are cleaned up when agents are deleted to prevent "Ghost Runs."

## 📦 Phase 2: The "Cockpit" Upgrade (Visuals)
**Goal:** Reflect the engine's power in the UI.
- [ ] **Job Monitor:** Sidebar showing "Active Runs" instead of generic chats.
- [ ] **Read-Only Editor:** Integrate Monaco to view artifacts (no editing yet to prevent race conditions).
- [ ] **Real-Time Sync:** UI updates instantly via WebSocket events.

## 📦 Phase 3: Real World Integration (Utility)
**Goal:** Connect to the outside world.
- [ ] **GitHub Bridge:** Clone public/private repos via URL.
- [ ] **Auth:** Simple GitHub OAuth.
- [ ] **PR Creation:** The final "Export" step of a job.

---

## 🛡️ The "Moat" (Technical Claims)
1.  **Process Isolation:** Every agent run works in a mathematically isolated Git Worktree.
2.  **Edge-Native Persistence:** State lives in Durable Objects (Zero-latency resume).
3.  **Universal Protocol:** Compatible with Rivet/MCP standards (future-proofing).