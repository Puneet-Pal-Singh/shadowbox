# Codex UI Replication - Implementation Plan

**Status**: In Progress  
**Started**: 2026-02-04  
**Goal**: Replicate OpenAI Codex app UI/UX in Shadowbox web app

---

## Architecture Principles (per GEMINI.md)

### SOLID Compliance

- **S (Single Responsibility)**: Each component has one purpose
- **O (Open/Closed)**: Components extendable via props, not modification
- **L (Liskov Substitution)**: Interfaces allow component swapping
- **I (Interface Segregation)**: Small, focused prop interfaces
- **D (Dependency Inversion)**: Depend on abstractions (types), not concretions

### KISS & DRY

- No component > 150 lines
- Shared hooks for common logic
- Shared types in dedicated files
- Composition over inheritance

### Type Safety

- **NO `any` TYPE** - Use `unknown` with narrowing
- All props typed with interfaces
- Zod for runtime validation where needed

---

## Component Architecture

### Directory Structure

```
components/
├── layout/
│   ├── TopNavBar.tsx           # Phase 1
│   ├── StatusBar.tsx           # Phase 6
│   ├── AgentSidebar.tsx        # Phase 2 (modify)
│   └── Workspace.tsx           # Phase 2 (modify)
├── navigation/
│   ├── SidebarNavItem.tsx      # Phase 2
│   ├── ThreadList.tsx          # Phase 2
│   └── SidebarSection.tsx      # Phase 2
├── chat/
│   ├── ChatInputBar.tsx        # Phase 5
│   ├── ThreadHeader.tsx        # Phase 7
│   ├── ChatMessage.tsx         # Phase 7 (modify)
│   ├── FilePill.tsx            # Phase 7
│   └── ExploredFilesSummary.tsx # Phase 7
├── ui/
│   ├── SuggestionCard.tsx      # Phase 4
│   ├── ModelSelector.tsx       # Phase 5
│   ├── Button.tsx              # Shared
│   └── Icon.tsx                # Shared
└── agent/
    └── AgentSetup.tsx          # Phase 3 (modify)
```

### Shared Types

```typescript
// types/ui.ts
export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  href?: string;
  onClick?: () => void;
  isActive?: boolean;
}

export interface SuggestionCardData {
  id: string;
  icon: LucideIcon;
  title: string;
  onClick?: () => void;
}

export interface Thread {
  id: string;
  title: string;
  projectId: string;
  status: "running" | "completed" | "error";
  timestamp: Date;
}

export interface Project {
  id: string;
  name: string;
  threads: Thread[];
}
```

---

## Implementation Phases

### Phase 1: Top Navigation Bar

**Components**: TopNavBar, NewThreadButton, UpgradeButton, OpenDropdown, CommitDropdown, WindowControls, ChangeCounter

**Files to Create**:

- `components/layout/TopNavBar.tsx` (main container)
- `components/navigation/NewThreadButton.tsx`
- `components/navigation/UpgradeButton.tsx`
- `components/navigation/OpenDropdown.tsx`
- `components/navigation/CommitDropdown.tsx`
- `components/ui/WindowControls.tsx`
- `components/ui/ChangeCounter.tsx`

**Specifications**:

```
Height: 48px
Background: #0c0c0e
Border-bottom: 1px solid #1a1a1a
Padding: 0 16px
Position: fixed top
Z-index: 50
```

**Layout**:

```
[Icon] [New thread]        [Get Plus]        [Open ▼] [Commit ▼] [-] [□] [×] [+5,446 ~0]
```

---

### Phase 2: Left Sidebar Redesign

**Modify**: AgentSidebar.tsx  
**Create**: SidebarNavItem, ThreadList, SidebarSection

**Specifications**:

```
Width: 260px
Background: #0c0c0e
Border-right: 1px solid #1a1a1a
Padding: 12px
```

**Structure**:

```
[New thread]
[Automations]
[Skills]

Threads        [+] [≡]
▼ shadowbox
  [Thread 1]
  [Thread 2]

[New project]

[Settings]
```

---

### Phase 3: Main Content - Centered Layout

**Modify**: AgentSetup.tsx  
**Create**: AnimatedLogo, ProjectSelector

**Specifications**:

```
Layout: Flex column, centered
Icon: 48px, centered
Title: "Let's build" (24px, white) + project name (gray)
Background: Subtle glow effect
```

---

### Phase 4: Suggestion Cards

**Modify**: AgentSetup.tsx (cards section)  
**Create**: SuggestionCard

**Specifications**:

```
Layout: Horizontal flex, 3 columns
Gap: 12px
Card:
  - Background: #171717
  - Border: 1px solid #262626
  - Border-radius: 12px
  - Padding: 16px
Icon: 20px in subtle container
```

---

### Phase 5: Input Area Redesign

**Modify**: ChatInterface.tsx  
**Create**: ChatInputBar, ModelSelector, InputToolbar

**Specifications**:

```
Container:
  - Background: #171717
  - Border: 1px solid #262626
  - Border-radius: 16px
  - Padding: 16px
  - Max-width: 720px

Placeholder: "Ask Codex anything, @ to add files, / for commands"

Toolbar:
  - Left: [+] Model dropdown
  - Right: [📎] [🎤] [↑]
```

---

### Phase 6: Status Bar

**Create**: StatusBar, TabSwitcher, BranchIndicator

**Specifications**:

```
Height: 36px
Background: #0c0c0e
Border-top: 1px solid #1a1a1a
Padding: 0 16px
Position: fixed bottom

Layout:
  [Upgrade]        [Local | Worktree]        [main]
```

---

### Phase 7: Active Chat View

**Modify**: ChatInterface.tsx, ChatMessage.tsx  
**Create**: ThreadHeader, FilePill, ExploredFilesSummary

**Specifications**:

```
Thread Header:
  - Height: 48px
  - Border-bottom: 1px solid #1a1a1a
  - Title + project + actions

Messages:
  - User: Right, bubble style, #262626 bg
  - Assistant: Left, full width

File Pills:
  - Blue tinted background
  - File name with icon
```

---

### Phase 8: Polish

**Tasks**:

- Color adjustments (#262626 borders)
- Animation refinements
- Typography consistency
- Spacing audit
- Responsive check

---

## Color Token Updates

```css
/* Add to index.css */
--color-surface-elevated: #171717;
--color-border-subtle: #262626;
--color-border-default: #1a1a1a;
--color-text-primary: #ffffff;
--color-text-secondary: #a1a1aa;
--color-text-tertiary: #71717a;
--color-accent-purple: #8b5cf6;
--color-accent-purple-hover: #7c3aed;
```

---

## Animation Standards

```typescript
// Framer Motion variants
export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.2 },
};

export const slideUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] },
};

export const hoverScale = {
  whileHover: { scale: 1.02 },
  whileTap: { scale: 0.98 },
  transition: { duration: 0.15 },
};
```

---

## Checklist

- [ ] Phase 1: TopNavBar
- [ ] Phase 2: Sidebar
- [ ] Phase 3: Centered Layout
- [ ] Phase 4: Suggestion Cards
- [ ] Phase 5: Input Bar
- [ ] Phase 6: Status Bar
- [ ] Phase 7: Chat View
- [ ] Phase 8: Polish

---

## Notes

- Keep existing API integration
- Maintain session/runId logic
- Test at 1280px+ resolution
- Icons: lucide-react
- Animations: Framer Motion
- Styling: Tailwind v4
- No `any` types allowed
