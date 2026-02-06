# 📋 Git Diff & File Explorer Sidebar Implementation Plan

**Author**: Opencode  
**Date**: 2025-02-05  
**Branch**: feat/ui-redesign  
**Status**: Draft - Pending Approval

---

## 🎯 Objective

Implement a right sidebar for Git operations (diff viewing and file management) following the Superset/Codex pattern where:

- A single button in the top-right opens the sidebar
- Sidebar has two tabs: **Changes** (Git Diff) and **Files** (File Explorer)
- Users can expand the sidebar to a full modal for detailed review

---

## 🏗️ Architecture Overview

Based on **GEMINI.md** separation of concerns:

### System Layers

| Layer                  | Responsibility                    | Files                                                    |
| ---------------------- | --------------------------------- | -------------------------------------------------------- |
| **Web (UI)**           | Render sidebar, tabs, diff viewer | `RightSidebar.tsx`, `ChangesPanel.tsx`, `FilesPanel.tsx` |
| **Brain (API)**        | Proxy git operations to Muscle    | `GitController.ts`                                       |
| **Muscle (Execution)** | Execute git commands in sandbox   | Git plugin in secure-agent-api                           |
| **Shared Types**       | Type definitions                  | `packages/shared-types/src/git.ts`                       |

---

## 📐 Component Structure

```
Workspace/
├── ChatInterface (existing)
├── RightSidebar (NEW)
│   ├── SidebarHeader
│   │   ├── ChangesTab (active toggle)
│   │   ├── FilesTab (active toggle)
│   │   ├── ExpandButton (opens full modal)
│   │   └── CloseButton
│   ├── ChangesPanel (NEW)
│   │   ├── ChangesList
│   │   │   └── ChangeItem (file + stats)
│   │   ├── DiffViewer
│   │   │   └── DiffLine (syntax highlighted)
│   │   └── CommitSection
│   │       ├── CommitMessageInput
│   │       ├── StageAllButton
│   │       └── CommitButton
│   └── FilesPanel (REFACTORED)
│       └── FileExplorer (existing component)
└── ExpandModal (NEW - full screen)
    ├── ModalHeader (tabs + close)
    └── ModalContent
        └── SideBySideDiffViewer
```

---

## 🔄 Data Flow

```
User clicks Git button → TopNavBar.toggleSidebar()
                              ↓
                    RightSidebar opens (default: Changes tab)
                              ↓
                    ChangesPanel mounts → fetchGitStatus()
                              ↓
                    Brain.GitController.getStatus()
                              ↓
                    Muscle.execute("git status --porcelain")
                              ↓
                    Response: FileStatus[]
                              ↓
                    Render ChangesList

User clicks file → ChangesPanel.selectFile(file)
                              ↓
                    fetchGitDiff(file.path)
                              ↓
                    Brain.GitController.getDiff(path)
                              ↓
                    Muscle.execute("git diff HEAD -- {path}")
                              ↓
                    Response: DiffContent
                              ↓
                    Render DiffViewer with syntax highlighting

User clicks Files tab → Switch to FilesPanel
                              ↓
                    Render existing FileExplorer component
```

---

## 🛠️ Implementation Phases

### Phase 1: Infrastructure (1-2 days)

**1.1 Shared Types** (`packages/shared-types/src/git.ts`)

```typescript
export interface FileStatus {
  path: string;
  status: "modified" | "added" | "deleted" | "renamed";
  additions: number;
  deletions: number;
}

export interface DiffContent {
  oldPath: string;
  newPath: string;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffLine {
  type: "unchanged" | "added" | "deleted";
  content: string;
  lineNumber: number;
}

export interface CommitPayload {
  message: string;
  files?: string[]; // If undefined, commits all staged
}
```

**1.2 Brain API** (`apps/brain/src/controllers/GitController.ts`)

- `GET /api/git/status` - Returns FileStatus[]
- `GET /api/git/diff?path={file}` - Returns DiffContent
- `POST /api/git/stage` - Stage files
- `POST /api/git/commit` - Commit with message
- `POST /api/git/push` - Push to remote

**1.3 Muscle Plugin** (`apps/secure-agent-api/src/plugins/git.ts`)

- Execute git commands in sandbox
- Parse `git status --porcelain` output
- Parse `git diff` unified format
- Handle errors gracefully

### Phase 2: UI Components (2-3 days)

**2.1 RightSidebar** (`apps/web/src/components/sidebar/RightSidebar.tsx`)

```typescript
interface RightSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onExpand: () => void;
  defaultTab: "changes" | "files";
}
```

**2.2 ChangesPanel** (`apps/web/src/components/sidebar/ChangesPanel.tsx`)

- Fetch and display git status
- List files with change stats (+/-)
- Expandable file rows
- Inline diff view
- Stage/unstage checkboxes
- Commit message input
- Commit button

**2.3 DiffViewer** (`apps/web/src/components/sidebar/DiffViewer.tsx`)

- Unified diff format
- Line numbers (old/new)
- Syntax highlighting (use existing highlighter)
- Collapsible hunks
- Word-level diff highlighting

**2.4 FilesPanel** (`apps/web/src/components/sidebar/FilesPanel.tsx`)

- Reuse existing FileExplorer component
- Tree view of all files
- File icons
- Click to open in editor (future)

**2.5 ExpandModal** (`apps/web/src/components/modal/ExpandModal.tsx`)

- Full-screen overlay
- Side-by-side diff view (split mode)
- All ChangesPanel features
- Keyboard shortcuts (ESC to close)

### Phase 3: Integration (1 day)

**3.1 TopNavBar Update**

- Replace GitDiffButton with toggle
- Pass sidebar state to Workspace

**3.2 Workspace Update**

- Add RightSidebar component
- Manage sidebar open/close state
- Handle expand modal

**3.3 State Management**

- Use React state (no new store needed)
- Lift sidebar state to Workspace
- Props drilling for simple state

### Phase 4: Polish (1 day)

**4.1 Animations**

- Sidebar slide-in from right (300ms ease-out)
- Tab switching fade (150ms)
- Diff expand/collapse (200ms)

**4.2 Error Handling**

- Git not initialized state
- No changes state
- Network error retry
- Commit validation (empty message)

**4.3 Accessibility**

- ARIA labels for tabs
- Keyboard navigation
- Focus management

---

## 📁 File Locations

### New Files

```
apps/web/src/
├── components/
│   ├── sidebar/
│   │   ├── RightSidebar.tsx
│   │   ├── SidebarHeader.tsx
│   │   ├── ChangesPanel.tsx
│   │   ├── FilesPanel.tsx
│   │   └── index.ts
│   ├── diff/
│   │   ├── DiffViewer.tsx
│   │   ├── DiffLine.tsx
│   │   ├── ChangesList.tsx
│   │   ├── ChangeItem.tsx
│   │   └── index.ts
│   └── modal/
│       ├── ExpandModal.tsx
│       └── index.ts
├── hooks/
│   ├── useGitStatus.ts
│   ├── useGitDiff.ts
│   └── useGitCommit.ts
└── services/
    └── GitService.ts

apps/brain/src/
├── controllers/
│   └── GitController.ts

apps/secure-agent-api/src/
└── plugins/
    └── git.ts

packages/shared-types/src/
└── git.ts
```

### Modified Files

```
apps/web/src/
├── components/
│   ├── layout/
│   │   ├── TopNavBar.tsx (update button)
│   │   └── Workspace.tsx (integrate sidebar)
│   └── chat/
│       └── ChatInterface.tsx (adjust for sidebar)
```

---

## 🎨 UI/UX Specifications

### Sidebar Dimensions

- **Width**: 320px (collapsed), 100vw (expanded modal)
- **Animation**: TranslateX from 100% to 0%
- **Duration**: 300ms
- **Easing**: cubic-bezier(0.4, 0, 0.2, 1)

### Tab Design

- **Changes Tab**: GitCommit icon + "Changes" label + badge count
- **Files Tab**: Folder icon + "Files" label
- **Active State**: Bottom border accent (emerald-500)

### Changes Panel

- **Header**: "Uncommitted Changes" + stage all checkbox
- **File Item**: Checkbox + filename + +/- stats + expand arrow
- **Diff View**: Line numbers + syntax highlighting + +/- gutters
- **Commit Section**: Textarea + "Commit" button

### Files Panel

- **Header**: "Files" + search input
- **Tree View**: Folders collapsible, files clickable
- **Icons**: FolderOpen/Folder for dirs, FileCode for files

---

## 🔒 Security Considerations

Per **GEMINI.md** Section 5:

1. **Path Traversal**: Validate all file paths server-side
2. **Command Injection**: Use parameterized git commands, never concat user input
3. **Sandbox Isolation**: All git operations scoped to runId worktree
4. **CORS**: Brain endpoints include proper CORS headers

---

## 🧪 Testing Strategy

### Unit Tests

- Diff parsing logic
- Status parsing
- Component rendering

### Integration Tests

- End-to-end git workflow
- Sidebar open/close/expand
- Commit flow

### Manual Tests

- Large diff performance
- Binary file handling
- Unicode filenames

---

## 📊 Success Criteria

- [ ] Sidebar opens/closes smoothly
- [ ] Changes tab shows modified files with stats
- [ ] Clicking file shows inline diff
- [ ] Files tab shows file tree
- [ ] Can stage/unstage files
- [ ] Can commit with message
- [ ] Expand modal shows side-by-side diff
- [ ] No TypeScript errors
- [ ] No `any` types used
- [ ] Follows GEMINI.md architecture

---

## ⏱️ Timeline Estimate

| Phase          | Duration | Total  |
| -------------- | -------- | ------ |
| Infrastructure | 1-2 days | 2 days |
| UI Components  | 2-3 days | 5 days |
| Integration    | 1 day    | 6 days |
| Polish         | 1 day    | 7 days |

**Total**: 7 days (conservative estimate)

---

## 🚧 Dependencies

- Existing FileExplorer component
- Syntax highlighting library (already present)
- Git binary in sandbox (already present)
- runId isolation (already implemented)

---

## 📝 Notes

1. **Pattern Consistency**: Follow existing patterns in ChatInterface, AgentSidebar
2. **State Management**: Keep it simple - React state + props
3. **Performance**: Virtualize long file lists, lazy load diffs
4. **Error States**: Design empty states, loading states, error states
5. **Mobile**: Consider responsive design (sidebar becomes bottom sheet on mobile)

---

## ✅ Approval Checklist

Before implementation starts:

- [ ] Architecture approved by system architect
- [ ] API contract reviewed
- [ ] UI mockups approved
- [ ] Security review passed

---

**Next Steps**:

1. Review and approve this plan
2. Create detailed task breakdown
3. Begin Phase 1 implementation
