# Workspace Chat Isolation Bug Analysis & Fix Plan

## Executive Summary

Your Shadowbox app is showing stale chat messages across different workspace sessions because the **frontend message cache (`agentStore`) never clears messages when switching workspaces or deleting sessions**. The backend properly isolates messages by `runId`, but the in-memory frontend cache leaks across sessions.

---

## The Problem

### Current Behavior (Image 1 - Bug)

- When you open any workspace, you see ALL previous chat messages from ALL sessions
- Messages from Agent 1 appear when viewing Agent 5
- Chat history is not isolated per workspace

### Expected Behavior (Image 2 - Target)

- Start from a clean "New Agent" screen
- Select repo/branch in a setup flow
- Each workspace shows ONLY its own chat messages
- Sidebar shows list of agents with status (running/completed)

---

## Root Cause Analysis

### Issue #1: Singleton Cache Never Clears

**File**: `apps/web/src/store/agentStore.ts`

```typescript
class AgentStore {
  private messagesMap: Map<string, Message[]> = new Map(); // NEVER EMPTIED

  getMessages(runId: string) {
    return this.messagesMap.get(runId) || []; // Returns stale data
  }

  // NO clearMessages() method exists!
}

export const agentStore = new AgentStore(); // Single global instance
```

**Impact**: Once a message is loaded for `runId = "agent-abc"`, it stays in memory forever. When you switch to a different session, the old messages are still there.

### Issue #2: No Cleanup on Session Switch

**File**: `apps/web/src/hooks/useChat.ts` (lines 55-99)

```typescript
useEffect(() => {
  const cached = agentStore.getMessages(runId);
  if (cached.length > 0) {
    setMessages(cached); // Immediately shows potentially stale cache
  }
  // Then fetches from backend...
}, [sessionId, runId]);
```

**Impact**: When switching workspaces, the effect runs and loads cached messages before fresh data arrives, showing stale content.

### Issue #3: No Cleanup on Session Delete

**File**: `apps/web/src/hooks/useSessionManager.ts`

```typescript
removeSession: (id) => {
  set((state) => ({
    sessions: state.sessions.filter((s) => s.id !== id),
  }));
  // MISSING: agentStore.clearMessages(id);
};
```

**Impact**: Deleted session messages remain in `agentStore` forever.

### Issue #4: Shared Session ID

**File**: `apps/web/src/components/layout/Workspace.tsx` (line 10)

```typescript
const sharedSessionId = "shared-workspace-v1"; // SAME for ALL sessions
```

**Impact**: All workspaces share the same DurableObject instance. While messages are keyed by `runId`, this is poor isolation and could cause issues.

---

## Data Flow Diagram

```
User Clicks Agent 5
       │
       ▼
App.tsx: setActiveSessionId("agent-5")
       │
       ▼
Workspace remounts (key={activeSessionId})
       │
       ▼
useChat("shared-workspace-v1", "agent-5")
       │
       ├─► agentStore.getMessages("agent-5") ──► Returns OLD cached messages 😱
       │                                           (from previous session)
       │
       └─► fetch(/chat?session=shared-workspace-v1&runId=agent-5)
              ▼
         Backend returns fresh messages
              ▼
         Updates agentStore
              ▼
         UI shows mixed old + new messages
```

---

## The Fix Strategy

### Phase 1: Add Message Cleanup to AgentStore

**File**: `apps/web/src/store/agentStore.ts`

Add methods:

```typescript
clearMessages(runId: string): void {
  this.messagesMap.delete(runId);
  this.notifyListeners(runId);
}

clearAllMessages(): void {
  this.messagesMap.clear();
  this.listeners.forEach((_, runId) => this.notifyListeners(runId));
}
```

### Phase 2: Clear Cache When Deleting Sessions

**File**: `apps/web/src/hooks/useSessionManager.ts`

```typescript
removeSession: (id) => {
  set((state) => ({
    sessions: state.sessions.filter((s) => s.id !== id),
  }));
  agentStore.clearMessages(id); // ADD THIS
};
```

### Phase 3: Reset Chat State on Workspace Switch

**File**: `apps/web/src/hooks/useChat.ts`

Option A - Skip cache on initial load:

```typescript
useEffect(() => {
  // DON'T load from cache immediately
  setMessages([]); // Start fresh

  // Then fetch from backend
  fetchMessages().then((msgs) => {
    setMessages(msgs);
    agentStore.setMessages(runId, msgs);
  });
}, [sessionId, runId]);
```

Option B - Clear cache on unmount:

```typescript
useEffect(() => {
  return () => {
    // Cleanup when leaving workspace
    setMessages([]);
  };
}, []);
```

### Phase 4: Default Screen Instead of Chat

**Files to modify**:

- `apps/web/src/App.tsx` - Show setup screen when no active session
- `apps/web/src/components/layout/Workspace.tsx` - Show repo/branch selector
- Create new: `apps/web/src/components/agent/AgentSetup.tsx`

Flow:

```
No active session
     │
     ▼
┌─────────────────────┐
│   AgentSetup.tsx    │
│ - Select repo       │
│ - Select branch     │
│ - Enter task        │
│ - "Start Agent"     │
└─────────────────────┘
     │
     ▼
Create new session
     │
     ▼
┌─────────────────────┐
│   Chat Interface    │
│   (Workspace)       │
└─────────────────────┘
```

### Phase 5: Sidebar Status Indicators

**File**: `apps/web/src/components/sidebar/AgentSidebar.tsx`

Add status badges:

```typescript
type AgentStatus = 'idle' | 'running' | 'completed' | 'error';

// Show colored dot or badge next to each agent
Agent 1 🟢 (running)
Agent 2 ⚪ (completed)
Agent 3 🔴 (error)
Agent 4 ⚫ (idle)
```

---

## Implementation Priority

1. **CRITICAL** - Add `clearMessages()` to agentStore (15 min)
2. **HIGH** - Call clear on session removal (5 min)
3. **HIGH** - Reset chat state on workspace switch (15 min)
4. **MEDIUM** - Create AgentSetup default screen (1 hour)
5. **LOW** - Add status indicators to sidebar (30 min)

---

## Files to Modify

| File                                           | Changes                                             |
| ---------------------------------------------- | --------------------------------------------------- |
| `apps/web/src/store/agentStore.ts`             | Add `clearMessages()`, `clearAllMessages()` methods |
| `apps/web/src/hooks/useSessionManager.ts`      | Import agentStore, call clear on removeSession      |
| `apps/web/src/hooks/useChat.ts`                | Reset messages on session change, add cleanup       |
| `apps/web/src/App.tsx`                         | Show setup screen when no active session            |
| `apps/web/src/components/layout/Workspace.tsx` | Pass through to setup or chat                       |
| `apps/web/src/components/agent/AgentSetup.tsx` | NEW FILE - Repo/branch selector + task input        |

---

## Testing Checklist

- [ ] Create Agent 1, send messages, delete Agent 1
- [ ] Create Agent 2, verify Agent 1 messages don't appear
- [ ] Switch between agents rapidly, verify isolation
- [ ] Refresh page, verify proper persistence
- [ ] Create agent without repo selected (should show setup)
- [ ] Verify status badges update correctly

---

## Why Previous Fixes Failed

You likely tried:

1. Changing localStorage keys - **Wrong**: Messages aren't in localStorage, they're in `agentStore` singleton
2. Remounting Workspace with `key` prop - **Partial**: This remounts the component but doesn't clear the global agentStore cache
3. Modifying backend storage - **Wrong**: Backend is already properly isolated by runId

The real fix requires clearing the **frontend memory cache** (`agentStore`) when sessions change.

---

## Quick Win - Immediate Fix

If you want to fix the stale messages NOW without the full refactor:

**In `apps/web/src/hooks/useChat.ts`, modify the useEffect:**

```typescript
useEffect(() => {
  // RESET messages immediately on session change
  setMessages([]);

  // Clear any existing listeners to prevent stale updates
  agentStore.unsubscribe?.(runId);

  // Then fetch fresh
  const loadMessages = async () => {
    try {
      const response = await fetch(
        `${API_BASE}/chat?session=${sharedSessionId}&runId=${runId}`,
      );
      const data = await response.json();

      // Only update if we're still on this session
      if (currentRunIdRef.current === runId) {
        setMessages(data.messages || []);
        agentStore.setMessages(runId, data.messages || []);
      }
    } catch (err) {
      console.error("Failed to load messages:", err);
    }
  };

  loadMessages();

  // Subscribe to new updates
  return agentStore.subscribe(runId, setMessages);
}, [sessionId, runId]);
```

This ensures messages are cleared immediately when switching sessions.
