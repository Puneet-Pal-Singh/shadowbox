The UI Gemini built in those three tries is a decent "v1 prototype," but it still looks like a generic web form. To compete with **Cursor**, **Kilo**, and **Blackbox**, "decent" isn't enough. You need **Polish**.

As your **Senior Staff Engineer**, here is the verdict: **STOP manual refinement. Switch to the "Library Heist" immediately.**

### Why Manual Refinement is a Trap:
1. **CSS Fatigue:** You will spend 20 more turns asking the agent to "make the border thinner" or "fix the padding." 
2. **Inconsistency:** Manual components lack the "feel" of a professional IDE (transitions, focus states, accessibility).
3. **Speed:** Importing **Shadcn/UI** and **Vercel AI SDK patterns** takes 10 minutes and gives you a $100M-looking UI instantly.

---

### 🏗️ The "Smarter Way" Execution Plan

We are going to use **Shadcn/UI** as our design system. It is what almost every AI startup uses because it’s high-quality and easy to customize.

#### Step 1: Initialize the Design System
Give this to your **UI Agent**:
> "Read `SHADOWBOX_RULES.md`. We are moving to a professional design system. 
> 1. Install `lucide-react`, `clsx`, `tailwind-merge`, and `framer-motion`.
> 2. Initialize **Shadcn/UI** in the `apps/web` project.
> 3. Add the `Sidebar`, `Button`, `Input`, and `Card` components from Shadcn.
> 4. Ensure the theme is set to **'Dark Mode'** by default using Zinc/Stone colors."

#### Step 2: The "Multi-Agent" Sidebar (The Anchor)
The sidebar in your screenshot is too simple. We need the **high-density sidebar** seen in Cursor.
> "Update the Sidebar using Shadcn. 
> - Group items into 'Active Tasks' and 'Completed'.
> - Each Agent/Run should show a status indicator (a pulsing green dot for running, a gray dot for idle).
> - Add a 'New Agent' button that triggers the centered Spawn UI."

#### Step 3: The "Magic" Command Bar (The Hook)
That "Spawn New Agent" screen should not be a static page. It should be a **Floating Modal** or a **Centered Command Bar** that appears when you hit `Cmd+K`.
> "Refactor the 'Spawn New Agent' UI into a centered Command Bar (inspired by `cmdk`). 
> - When the user clicks 'Launch Agent', use `Framer Motion` to animate the bar moving to the bottom of the screen to become the chat input, while the chat area fades in."

---

### 🛡️ The "Shadowbox" Visual Identity
To stay "Pro," we stick to this palette:
- **Background:** `#000000` (Pure Black)
- **Borders:** `zinc-800`
- **Text:** `zinc-100` (Primary), `zinc-500` (Secondary)
- **Accent:** `emerald-500` (The "Airlock" Green)

### 🚀 Immediate Action Recommendation
Don't let Gemini CLI try to "fix" the current buttons. Tell it to **delete the custom CSS and install Shadcn**. 

**Shall I give you the low-level code for the `AgentSidebar.tsx` using Shadcn/UI?** This will give you the "Tabs/Jobs" feel you saw in Conductor and Superset immediately.

As your **Co-Founder**, I’ll give you the "Startup Shortcut." 

**Do NOT build this from scratch.** You will spend two weeks tweaking CSS borders and shadows when you could be shipping features. 

To get that **Cursor/Blackbox** look in under 48 hours, we are going to use the **"Modern Tech Stack Trinity"**: **Shadcn/UI** + **Framer Motion** + **Vercel AI Chat UI Patterns**.

### 🛠️ The "Heist" Component List

Here are the specific libraries and components you should import to match those screenshots exactly:

#### 1. The Layout: `Shadcn Sidebar`
Cursor and Blackbox both use a **collapsible, high-density sidebar**. 
*   **Library:** [Shadcn/UI Sidebar](https://ui.shadcn.com/docs/components/sidebar)
*   **Why:** It handles mobile responsiveness, keyboard shortcuts (`Cmd+B`), and grouping (Active Tasks vs. History) out of the box.

#### 2. The Centered Command Bar: `Framer Motion`
That "floating" input bar in the center of the screen (Screenshot 1) requires smooth transitions when it moves from the center to the bottom.
*   **Library:** [Framer Motion](https://www.framer.com/motion/)
*   **Component Pattern:** Use a **"Shared Layout Animation."** When the user types their first message, the bar "flies" to the bottom of the screen while the chat history fades in above it.

#### 3. The Chat Logic UI: `Vercel AI SDK UI Components`
Since we already use the Vercel AI SDK for the brain, use their official **Chat UI patterns**.
*   **Source:** [Vercel Chat Template GitHub](https://github.com/vercel/ai-chatbot)
*   **What to steal:** Their `ChatList`, `ChatMessage`, and `Markdown` components. They have already solved the "flickering markdown" and "auto-scroll" problems.

---

### 🏗️ Revised Implementation Plan: The "Visual Identity" Task

Give this command to your **UI Agent** to transform the current app into the "Cursor-look":

```markdown
@SHADOWBOX_RULES.md
@docs/architecture/overview.md

# 🎨 Task: Transform UI to Agentic Workspace (Cursor/Blackbox Style)

## 🎯 Goal
Implement a pro-grade IDE layout with a centered command bar for new tasks and a persistent side-pane for active runs.

## 🛠️ Step 1: Sidebar Implementation
- Install `shadcn/ui` Sidebar component.
- Create `components/layout/AppSidebar.tsx`.
- Sidebar must show:
  - **Top**: "New Task" button (+ icon).
  - **Middle**: "Active Tasks" (List of AgentRuns from Zustand store).
  - **Bottom**: User Profile / Settings.

## 🛠️ Step 2: The "Zero-State" View
- In `ChatInterface.tsx`, if `activeRunId` is null:
  - Render a **Centered Command Bar** (min-w-[600px]).
  - Display "Suggested Actions" badges below it (e.g., "Run security audit", "Fix @components").
  - Styling: Border zinc-800, Background zinc-950/50, heavy shadow.

## 🛠️ Step 3: The "Active Run" Transition
- When a task starts, use `Framer Motion` to animate the Command Bar to the bottom of the viewport.
- Transition from "New Task" view to "Chat Flow" view.

## 🛠️ Step 4: Markdown & Code Highlighting
- Ensure `ChatMessage.tsx` uses `react-markdown` with `remark-gfm`.
- Code blocks must have a "Copy" button and look like VS Code (Dark+ theme).

**Constraint**: Keep it strictly monochromatic (Black, White, Zinc). No rainbow colors. Use emerald-500 only for "Success" indicators.
```

---

### 🛡️ Why this strategy wins:
1.  **Identity:** You match the "market standard" (Cursor) so users feel comfortable immediately.
2.  **Speed:** Using Shadcn/UI means we are using pre-tested accessible components.
3.  **Moat Integration:** This UI will perfectly reflect our **AgentRun** architecture (one sidebar item = one isolated worktree).

**Shall we install Shadcn/UI and start with the Sidebar?** This is the frame that holds the whole product together.