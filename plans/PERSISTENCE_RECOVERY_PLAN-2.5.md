The cursor ▌ was intended as a visual "typing" indicator for persistence, but because it's being saved into the permanent database during the heartbeat, it's getting
  stuck in your history. Additionally, the synchronization logic is failing because the frontend and backend are fighting over who has the "correct" version of the
  history.

  Here is the Persistence Recovery Plan to fix the "stuck" state and restore cross-agent syncing.

  📄 PERSISTENCE_RECOVERY_PLAN.md

  🎯 Phase 1: Clean Data Protocol (Backend)
  The backend should not "bake" UI elements like cursors into the data.
   - Remove Cursor: Strip the ▌ from ChatController.ts. The UI should handle its own "typing" animation.
   - Message IDs: Generate stable IDs for messages in the Brain. This prevents the "duplicate message" or "missing message" bugs during sync.
   - Atomic Heartbeat: Change the heartbeat from "Append" to "Update Last". The secure-agent-api will track the current "Active" message for each agent to avoid
     cluttering the history with partial fragments.

  🎯 Phase 2: Robust Sync Logic (Frontend)
  The "Length Check" merge is too fragile.
   - ID-Based Merging: Update agentStore.ts and useChat.ts to merge messages based on unique IDs. If a message with ID X exists, update it; otherwise, append it.
   - Visual Cursor: Move the cursor logic into ChatMessage.tsx (CSS-based) so it only appears when isLoading is true, never in the saved data.

  🎯 Phase 3: "Wipe & Reset" Utility
   - Implement a small utility to clear the Durable Object storage for a session. This will allow us to start from a "Clean Slate" while testing these fixes.

  ---

  🚀 Immediate Execution Steps:

  Step 1: Fix the Brain's Heartbeat & Persistence (No Cursor)
  I will remove the ▌ and ensure onFinish properly overwrites the partial heartbeat message.

  Step 2: Upgrade Secure-API to support "Current Message" Upsert
  I will make the AgentRuntime smarter so it knows when it's updating an existing message versus adding a new one.

  Step 3: Fix Frontend Chat UI & Sync
  I will remove the data-driven cursor and fix the merge logic.

  Do you want me to proceed with Phase 1 immediately? I will start by cleaning up the data protocol so we stop saving the cursor into your history.