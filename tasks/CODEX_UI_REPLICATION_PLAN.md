# Codex UI Replication Plan for Shadowbox

## Overview

Replicate OpenAI Codex app UI/UX in Shadowbox web app. Focus on visual fidelity and user experience patterns.

---

## Phase 1: Top Navigation Bar

### Current State

Shadowbox has no top navigation bar.

### Target (Codex Style)

- **Left side**: "New thread" button with sparkle icon
- **Center**: "Get Plus" upgrade button (purple gradient)
- **Right side**:
  - "Open" dropdown with VS Code icon
  - "Commit" dropdown with Git icon
  - Window control buttons (minimize, maximize, close)
  - Counter showing "+5,446 ~0" (file changes)

### Implementation Details

```
Position: Fixed top, full width
Height: 48px
Background: #0c0c0e (same as sidebar)
Border-bottom: 1px solid #1a1a1a
Padding: 0 16px
```

**Components to Create:**

1. `TopNavBar.tsx` - Main container
2. `NewThreadButton.tsx` - Button with icon
3. `UpgradeButton.tsx` - Purple gradient "Get Plus" button
4. `OpenDropdown.tsx` - VS Code integration dropdown
5. `CommitDropdown.tsx` - Git operations dropdown
6. `WindowControls.tsx` - macOS-style window buttons
7. `ChangeCounter.tsx` - Git changes indicator

---

## Phase 2: Left Sidebar Redesign

### Current State

Simple task list with minimal styling.

### Target (Codex Style)

Navigation menu with sections:

- **Top**: New thread (with icon)
- **Middle**: Automations (clock icon), Skills (cube icon)
- **Section**: "Threads" header with add/sort buttons
  - Project name (shadowbox)
  - Thread list
- **Bottom**: New project button, Settings

### Implementation Details

```
Width: 260px (expanded from 64px)
Background: #0c0c0e
Border-right: 1px solid #1a1a1a
Padding: 12px
```

**Menu Items:**

- New thread (pencil icon)
- Automations (clock icon)
- Skills (cube/box icon)
- Threads section (header with + and filter icons)
  - shadowbox (folder icon)
  - Individual threads listed below
- New project (folder-plus icon)
- Settings (gear icon) at bottom

**Components to Create/Modify:**

1. Modify `AgentSidebar.tsx` - Expand width, add navigation structure
2. `SidebarNavItem.tsx` - Individual nav items with icons
3. `ThreadList.tsx` - List of threads under project
4. `SidebarSection.tsx` - Collapsible sections

---

## Phase 3: Main Content - Centered Layout

### Current State

Simple centered layout with logo and title.

### Target (Codex Style)

Centered content area with:

- Cloud/brain icon at top (larger, animated)
- "Let's build" text with project name dropdown
- Project name styled as link/dropdown
- Subtle background glow effect

### Implementation Details

```
Layout: Flex column, centered
Icon: 48px, centered above title
Title: "Let's build" in white, project name in gray with dropdown arrow
Font: System font, 24px for title
Spacing: 24px between elements
```

**Components to Create/Modify:**

1. Modify `AgentSetup.tsx` - Restructure layout
2. `AnimatedLogo.tsx` - Cloud/brain icon with subtle animation
3. `ProjectSelector.tsx` - Dropdown for project name
4. `GlowBackground.tsx` - Subtle gradient glow behind content

---

## Phase 4: Suggestion Cards

### Current State

3 cards with icons, titles, and descriptions.

### Target (Codex Style)

3 horizontal cards at bottom:

- Game controller icon - "Build a classic Snake game in this repo."
- Document icon - "Create a one-page $pdf that summarizes this app."
- PR/Branch icon - "Summarize last week's PRs by teammate and theme."

### Implementation Details

```
Layout: Horizontal flex, 3 equal columns
Gap: 12px
Card style:
  - Background: #171717
  - Border: 1px solid #262626
  - Border-radius: 12px
  - Padding: 16px
  - Hover: slight brightness increase
Icon: 20px, in colored circle/container
Text: White title, no description
```

**Components to Create/Modify:**

1. Modify `AgentSetup.tsx` - Update card styling
2. `SuggestionCard.tsx` - Individual card component
3. Update card data structure to match Codex style

---

## Phase 5: Input Area Redesign

### Current State

Simple textarea with send button.

### Target (Codex Style)

Rich input bar with:

- Placeholder: "Ask Codex anything, @ to add files, / for commands"
- Left: Plus icon for attachments
- Model selector: "GPT-5.2-Codex Medium" with dropdown
- Right: Attachment icon, Microphone icon, Send button (circular)

### Implementation Details

```
Container:
  - Background: #171717
  - Border: 1px solid #262626
  - Border-radius: 16px
  - Padding: 16px
  - Max-width: 720px

Input:
  - Background: transparent
  - Border: none
  - Font-size: 16px
  - Placeholder color: #71717a

Toolbar:
  - Display: flex, space-between
  - Margin-top: 12px

Model selector:
  - Background: transparent
  - Border: none
  - Font-size: 14px
  - Color: #a1a1aa

Send button:
  - Circular, 32px
  - Background: white
  - Icon: dark gray arrow up
```

**Components to Create/Modify:**

1. Modify `ChatInterface.tsx` - Update input styling
2. `ChatInputBar.tsx` - New rich input component
3. `ModelSelector.tsx` - Dropdown for model selection
4. `InputToolbar.tsx` - Bottom toolbar with actions

---

## Phase 6: Status Bar

### Current State

No status bar visible.

### Target (Codex Style)

Bottom bar with:

- Left: "Upgrade" button
- Center: Tabs - "Local" | "Worktree"
- Right: Branch name with icon

### Implementation Details

```
Position: Fixed bottom, full width
Height: 36px
Background: #0c0c0e
Border-top: 1px solid #1a1a1a
Padding: 0 16px
Font-size: 13px
```

**Components to Create:**

1. `StatusBar.tsx` - Main container
2. `TabSwitcher.tsx` - Local/Worktree tabs
3. `BranchIndicator.tsx` - Current branch display

---

## Phase 7: Active Chat View

### Current State

Chat shows in workspace layout.

### Target (Codex Style)

When thread is active:

- Top bar shows thread title
- Left sidebar highlights active thread
- Main area shows conversation:
  - User messages on right (bubble style)
  - Assistant messages on left (full width, markdown)
  - File references as pills/tags
  - "Explored X files, Y lists" summary line
- Input bar at bottom (same as empty state)

### Implementation Details

```
Thread title bar:
  - Height: 48px
  - Border-bottom: 1px solid #1a1a1a
  - Shows: Thread name, project name, actions

Message bubbles:
  - User: Right-aligned, #262626 background, rounded-2xl
  - Assistant: Left-aligned, full width, no background

File pills:
  - Background: #1e3a5f (blue tinted)
  - Color: #60a5fa
  - Border-radius: 4px
  - Padding: 2px 8px
```

**Components to Create/Modify:**

1. Modify `ChatMessage.tsx` - Update message styling
2. `ThreadHeader.tsx` - Active thread title bar
3. `FilePill.tsx` - File reference tags
4. `ExploredFilesSummary.tsx` - File exploration summary

---

## Phase 8: Polish & Animation

### Color Palette Adjustments

```css
/* Current vs Target */
Background: #000000 → #000000 (keep)
Surface: #0c0c0e → #0c0c0e (keep)
Card: #171717 → #171717 (match Codex)
Border: #27272a → #262626 (slightly lighter)
Text Primary: #fafafa → #ffffff
Text Secondary: #a1a1aa → #a1a1aa (keep)
Accent: #10b981 → keep emerald for now
```

### Animations to Add

1. **Sidebar hover**: 150ms ease-out background change
2. **Card hover**: Scale 1.02, brightness 1.1
3. **Input focus**: Border color transition to #3f3f46
4. **Send button**: Scale down on click, ripple effect
5. **Page transitions**: Fade in 200ms
6. **Message appear**: Slide up 20px + fade in

### Typography Adjustments

- Use system font stack (-apple-system, BlinkMacSystemFont)
- Increase line height for readability (1.6)
- Code: JetBrains Mono (keep)

### Spacing System

- Sidebar: 12px padding
- Cards: 16px padding
- Messages: 16px gap
- Sections: 24px gap

---

## File Changes Summary

### New Files to Create:

1. `components/layout/TopNavBar.tsx`
2. `components/layout/StatusBar.tsx`
3. `components/navigation/SidebarNavItem.tsx`
4. `components/navigation/ThreadList.tsx`
5. `components/chat/ChatInputBar.tsx`
6. `components/chat/ThreadHeader.tsx`
7. `components/ui/SuggestionCard.tsx`
8. `components/ui/ModelSelector.tsx`
9. `components/ui/FilePill.tsx`

### Files to Modify:

1. `components/layout/AgentSidebar.tsx` - Full redesign
2. `components/layout/Workspace.tsx` - Add top nav and status bar
3. `components/agent/AgentSetup.tsx` - Update layout and cards
4. `components/chat/ChatInterface.tsx` - New input design
5. `components/chat/ChatMessage.tsx` - Update styling
6. `index.css` - Update color tokens and add utilities

---

## Implementation Order

1. **Phase 1**: TopNavBar + StatusBar (framework)
2. **Phase 2**: Sidebar redesign (navigation)
3. **Phase 3**: Main centered layout (AgentSetup)
4. **Phase 4**: Suggestion cards styling
5. **Phase 5**: Input bar redesign
6. **Phase 6**: Active chat view improvements
7. **Phase 7**: Polish, animations, colors

---

## Success Criteria

- [ ] Visual match to Codex screenshots within 90% fidelity
- [ ] All interactive elements have hover states
- [ ] Smooth animations throughout
- [ ] Responsive layout (works at 1280px+)
- [ ] Dark mode only (no light mode needed)
- [ ] Consistent spacing and typography

---

## Notes

- Keep existing functionality - only change UI
- Maintain current API integration
- Use existing Tailwind v4 setup
- Leverage Framer Motion for animations
- Icons from lucide-react
- Keep Shadowbox branding but adopt Codex layout patterns
