# 📄 `code-rules.md`

## 🧬 Shadowbox Engineering Constitution

### 1. The Golden Rule: Architectural Integrity
*   **CORE PROTECTION:** Never modify the low-level kernel files in `apps/secure-agent-api/src/core` or `apps/brain/src/index.ts` unless explicitly instructed. These are the foundations.
*   **MODULAR EXTENSION:** If you need to add functionality, create a new **Service**, **Plugin**, or **Helper**. Extend the system, don't rewrite the core.

---

### 2. Core Programming Principles (The "Big Four")
*   **S.O.L.I.D. Only**:
    *   **S (Single Responsibility)**: A file does ONE thing. A `FileService` manages files; it does not handle Chat logic.
    *   **O (Open/Closed)**: Code should be open for extension but closed for modification. Use interfaces and adapters.
    *   **L/I/D**: Favor composition over inheritance. Depend on abstractions, not concretions.
*   **D.R.Y. (Don't Repeat Yourself)**: If you find yourself copying code between `apps/web` and `apps/brain`, move it to a shared helper or a utility class in `packages/shared`.
*   **K.I.S.S. (Keep It Simple, Stupid)**: Avoid "God Objects." If a function is more than 30 lines, break it down.
*   **SRP (Single Responsibility Principle)**: Every class/function should have only one reason to change.

---

### 3. File & Structure Standards
*   **Helper Pattern**: Do not put business logic in React components or Cloudflare entry points (`fetch` handlers).
    *   *Wrong:* Logic inside `useChat.ts`.
    *   *Right:* Extract logic to `src/lib/ChatService.ts` and call it from the hook.
*   **Service Pattern**: External API calls (to Google, Groq, or the Sandbox) must be wrapped in a Service class with proper error handling.
*   **Adapter Pattern**: When integrating third-party SDKs (like Vercel AI SDK or Rivet), create an "Adapter" so we can swap providers without breaking the UI.

---

### 4. Strict TypeScript Protocol
*   **NO `any` TYPE**: Use of `any` is an automatic build failure.
*   **Discriminated Unions**: Use them for state and events (e.g., `type ToolStatus = 'running' | 'success' | 'failed'`).
*   **Interfaces First**: Always define the data contract (Interface/DTO) before writing the logic.
*   **Generic Safety**: Use Generics `<T>` for reusable components and services to maintain type flow.

---

### 5. Multi-Agent & Persistence Rules
*   **Server-Side Truth**: The UI is a "dumb" reflection of the server state. If you are adding features like Chat History, it must be stored in the **Durable Object**, not just local state.
*   **Event-Driven UI**: Use `window.dispatchEvent` or WebSockets to sync state between the Sandbox and the Cockpit. Do not poll for changes.

---

### 6. Review Checklist for AI Agents
Before committing, the agent must verify:
1. Is this logic in a dedicated helper file?
2. Did I use an Interface for the new data structure?
3. Does this change affect the core engine? (If yes, stop and ask).
4. Is there a simpler way to achieve this (KISS)?

---

## 🚀 How to use this with AI Agents:
When starting a new task with a coding agent, paste this instruction:
> "Read `code-rules.md` in the root. You must follow these standards strictly. I want robust, scalable code. Move all logic into helper files and services. Do not bloat the main entry points."