# 🧠 Shadowbox: Persistence & Context Refinement Plan

## 🚩 The Problem
Currently, the UI hydrations sends the entire history back to the AI. This can cause "context dumping" where the AI re-explains or re-lists everything it already did, leading to a cluttered and overwhelming chat.

## 🎯 Goals
1. **Zero-Dump Hydration**: The UI loads history for display, but the Brain handles context intelligently.
2. **Server-Side Context**: The Brain fetches the "Truth" from the Durable Object directly, reducing client-side payload.
3. **Artifact-Aware History**: History should prioritize conversation flow over raw data blobs.

## 🛠️ Action Items

### 1. Server-Side Context Loading (`apps/brain`)
- **File**: `src/controllers/ChatController.ts`
- **Logic**: Before calling `streamText`, the Brain will fetch history from the `SECURE_API`.
- **Benefit**: Even if the user clears their local storage, the AI remembers what happened in that session.

### 2. History Pruning & Cleaning
- **File**: `apps/secure-agent-api/src/core/AgentRuntime.ts`
- **Logic**: Implement a "Summary" or "Pruning" mechanism so that old tool results (like huge `list_files` outputs) don't clog the context window.

### 3. UI "Dumb" Hydration
- **File**: `apps/web/src/hooks/useChat.ts`
- **Logic**: Use `initialMessages` only for rendering. Ensure the `agentId` and `sessionId` are correctly mapped so that switching agents doesn't cross-contaminate history.

### 4. Shared Workspace Identity
- **Logic**: Standardize the relationship between `Session` (The Sandbox/Files) and `Agent` (The Chat Persona).
- **Rule**: Multiple Agents -> One Sandbox. One Agent -> One History.

---
**Next Step**: Should I begin implementing "Server-Side Context Loading" (Action Item 1) to solve the "dumping" issue?
