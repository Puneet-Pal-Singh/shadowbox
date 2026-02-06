# 🎨 Shadowbox → Codex UI Migration Plan

## Overview
Transform Shadowbox UI from basic workspace to professional Codex-like IDE interface.  
**Target Design**: ChatGPT Codex UI (screenshot 2)

---

## 📋 Feature Breakdown (Priority Order)

### PHASE 1: Sidebar & Navigation (Week 1)
**Current State**: Tasks list  
**Target State**: Professional sidebar with multiple sections

#### 1.1 Sidebar Structure
```
Top Section:
├─ [NEW THREAD] button with "+" icon
├─ Automations (icon + text)
└─ Skills (icon + text)

Middle Section:
├─ "Threads" header with view toggles
├─ "shadowbox" project (collapsible)
│  └─ No threads (empty state)
└─ "New project" button

Bottom Section:
├─ "Personal" (user profile)
└─ "Upgrade" link
```

**Components to Build**:
- `<SidebarNav />` - Navigation container
- `<NavSection />` - Collapsible sections
- `<NavItem />` - Individual nav items with icons
- `<ProjectTree />` - Nested project/thread structure

**Tailwind Classes**:
- Base: `w-64 bg-black border-r border-zinc-800`
- Items: `hover:bg-zinc-900 rounded px-3 py-2 text-sm`
- Active: `bg-zinc-800 text-white`

---

### PHASE 2: Top Header Bar (Week 1)
**Current State**: Workspace title only  
**Target State**: Full action bar with buttons

#### 2.1 Header Components
```
Left Side:
└─ "New thread" title

Center:
└─ "Get Plus" (purple badge button)

Right Side:
├─ "Open" (dropdown)
├─ "Commit" (dropdown)
├─ Stats badge "+284 -42" (diff counter)
├─ Icon buttons (4x)
│  ├─ Document/Window
│  ├─ Split view
│  ├─ Settings
│  └─ More options
```

**Components to Build**:
- `<HeaderBar />` - Top navigation
- `<ActionButton />` - Dropdown buttons
- `<DiffBadge />` - Shows +284 -42 stats
- `<IconButton />` - Rounded icon buttons

**Tailwind Classes**:
- Header: `h-12 border-b border-zinc-800 flex items-center justify-between px-6`
- Badge: `bg-purple-600/20 text-purple-400 text-xs px-2 py-1 rounded`

---

### PHASE 3: Main Content Area (Week 2)
**Current State**: Static "Let's build" heading with input box  
**Target State**: Responsive centered content with suggested actions

#### 3.1 Zero-State Layout
```
[Large Logo Icon]
    ↓
"Let's build"
"shadowbox" (dropdown)
    ↓
[Single input box]
    ↓
3 Suggested Action Cards
```

**Components to Build**:
- `<ZeroStateLayout />` - Centered container
- `<Logo />` - Icon display
- `<Title />` - "Let's build" text
- `<ProjectDropdown />` - Select project
- `<InputBox />` - Single textarea (enhanced)
- `<SuggestedActionCard />` - Card component
- `<ActionCardsGrid />` - 3-column grid

**Tailwind Classes**:
- Container: `flex flex-col items-center justify-center h-full bg-black`
- Logo: `w-16 h-16 border border-zinc-800 rounded-2xl`
- Cards Grid: `grid grid-cols-3 gap-4 w-full max-w-4xl`

---

### PHASE 4: Input Box (Week 2)
**Current State**: Simple textarea  
**Target State**: Codex-style command input with model selector

#### 4.1 Enhanced Input
```
Input Area:
├─ Text field: "Ask Codex anything, @ to add files, / for commands"
├─ Icon: @ mentions
├─ Icon: / commands
├─ Icon: Upload/attachment
└─ Icon: Send button

Below Input:
├─ Model Selector: "GPT-5.2-Codex Medium" (dropdown)
├─ Settings icon
├─ Mic icon
└─ Send button (large circle)
```

**Components to Build**:
- `<CommandInput />` - Main input with icons
- `<ModelSelector />` - Dropdown with model choice
- `<InputToolbar />` - Icon row below input

**Features**:
- Auto-expand on focus
- Syntax highlighting for commands
- @ mentions for files
- / commands autocomplete

---

### PHASE 5: Bottom Status Bar (Week 2)
**Current State**: None  
**Target State**: Git/environment status bar

#### 5.1 Status Bar Layout
```
Left: "Local"
Center: "Worktree" (selected environment)
Right: "main" (git branch selector)
```

**Components to Build**:
- `<StatusBar />` - Bottom bar
- `<StatusItem />` - Individual status items
- `<BranchSelector />` - Git branch dropdown

**Tailwind Classes**:
- Bar: `h-10 border-t border-zinc-800 flex items-center justify-between px-6 bg-black text-xs text-zinc-500`

---

### PHASE 6: Modal / Quick Actions (Week 3)
**Current State**: Direct input  
**Target State**: Keyboard shortcuts and command palette

#### 6.1 Features
- `Cmd+K` to open command palette
- Quick project/thread switcher
- Settings modal
- "Get Plus" flow

**Components to Build**:
- `<CommandPalette />` - Global search/actions
- `<SettingsModal />` - Settings panel
- `<PlusModal />` - Upgrade prompt

---

### PHASE 7: Responsive & Polish (Week 3)
- Mobile sidebar collapse
- Tablet layout adjustments
- Animations & transitions
- Dark mode consistency
- Accessibility (ARIA labels, keyboard nav)

---

## 🛠 Technical Implementation

### File Structure
```
apps/web/src/
├── components/
│   ├── layout/
│   │   ├── HeaderBar.tsx
│   │   ├── Sidebar.tsx
│   │   ├── StatusBar.tsx
│   │   └── MainLayout.tsx
│   ├── workspace/
│   │   ├── ZeroState.tsx
│   │   ├── SuggestedActions.tsx
│   │   └── ActionCard.tsx
│   ├── input/
│   │   ├── CommandInput.tsx
│   │   ├── ModelSelector.tsx
│   │   └── InputToolbar.tsx
│   └── modals/
│       ├── CommandPalette.tsx
│       ├── SettingsModal.tsx
│       └── GetPlusModal.tsx
├── hooks/
│   ├── useCommandPalette.ts
│   ├── useSidebar.ts
│   └── useHeaderActions.ts
└── lib/
    └── codex-ui.ts (design tokens)
```

### Dependencies to Add
```json
{
  "framer-motion": "^10.16.0",
  "zustand": "^4.4.0",
  "radix-ui": "^1.0.0",
  "cmdk": "^0.2.0"
}
```

---

## 📐 Design Token Mapping

### Colors
- Background: `#000000` (black)
- Borders: `#27272a` (zinc-800)
- Text Primary: `#fafafa` (zinc-50)
- Text Secondary: `#a1a1aa` (zinc-600)
- Accent: `#a855f7` (purple-600) for "Get Plus"
- Success: `#10b981` (emerald-600)

### Spacing
- Base unit: 4px (Tailwind default)
- Header height: 48px (h-12)
- Sidebar width: 256px (w-64)
- Status bar height: 40px (h-10)

### Typography
- Headings: `text-xl font-bold`
- Body: `text-sm`
- Labels: `text-xs uppercase tracking-wide`

---

## 🎯 Implementation Milestones

### Week 1
- [ ] Sidebar structure complete
- [ ] Header bar with dropdowns
- [ ] Navigation icons integrated
- [ ] Basic layout working

### Week 2
- [ ] Zero-state "Let's build" layout
- [ ] Suggested action cards (3 demos)
- [ ] Enhanced input box
- [ ] Status bar

### Week 3
- [ ] Command palette (`Cmd+K`)
- [ ] Settings modal
- [ ] Responsive breakpoints
- [ ] Polish & animations

---

## 🔄 Migration Strategy

### Step 1: Create New Layout Components
- Don't modify existing files yet
- Build parallel to current workspace
- Keep current Workspace.tsx as fallback

### Step 2: Feature Parity
- Ensure all current functionality works in new UI
- Test message streaming
- Test artifact creation

### Step 3: Gradual Rollout
- Route to new UI behind feature flag
- `?ui=codex` query param for testing
- Full migration after QA passes

### Step 4: Remove Legacy UI
- Delete old components after full migration
- Update routes and imports

---

## 📱 Responsive Breakpoints

| Breakpoint | Sidebar | Layout | Status |
|-----------|---------|--------|--------|
| Mobile (< 640px) | Collapsed (hamburger) | Stack | Hidden |
| Tablet (640-1024px) | Side drawer | Single col | Visible |
| Desktop (> 1024px) | Visible | Multi col | Visible |

---

## ♿ Accessibility Checklist

- [ ] All buttons have aria-labels
- [ ] Keyboard navigation (Tab, Arrows, Enter)
- [ ] Focus indicators visible (ring-offset)
- [ ] Color contrast WCAG AA compliant
- [ ] Screen reader support for dropdowns
- [ ] Cmd+K keyboard shortcut works
- [ ] Modal focus trap

---

## 🚀 Success Criteria

✅ UI visually matches Codex design  
✅ All buttons functional and respond to clicks  
✅ Input box expands/contracts on focus  
✅ Sidebar navigation switches between views  
✅ Status bar updates on branch changes  
✅ Command palette (Cmd+K) opens/closes  
✅ Zero layout with suggested cards displays  
✅ Responsive on mobile/tablet  
✅ No breaking changes to chat functionality  
✅ Build time < 5 seconds  

---

## 📚 Reference Links

- [Codex UI Overview](https://chatgpt.com/features/codex/)
- [OpenAI UI Guidelines](https://developers.openai.com/apps-sdk/concepts/ui-guidelines/)
- [Shadcn/UI Components](https://ui.shadcn.com/)
- [Radix UI Primitives](https://www.radix-ui.com/)

---

## 💡 Notes

- Use existing AgentSetup component as reference for zero-state design
- Leverage existing Tailwind config for consistency
- Keep chat functionality separate from UI (hooks/services already abstracted)
- Consider using Radix UI for accessible dropdown components
- Animations via Framer Motion for smooth transitions

