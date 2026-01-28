# 🧬 SHADOWBOX_RULES.md (Architectural Guardrails)

## 1. Core Philosophy
- **Agent-in-the-Loop**: We are building an agentic workspace. The UI must hide technical "plumbing" (tool names) and emphasize "Outcomes" (Action Blocks).
- **Security-First**: All code execution happens in the Cloudflare Sandbox. Never attempt to run logic on the client that belongs in the Secure API.

## 2. Coding Standards (Strict Compliance)
- **TypeScript**: No `any`. Use generics and Discriminated Unions for `ChatMessage` and `ToolCall`.
- **SOLID**: One file = One responsibility. Extract logic from React components into `Controllers` or `Services`.
- **React 19**: Use `useTransition` for state updates during AI thinking to keep UI responsive.
- **Tailwind v4**: Use CSS-first theming. All colors must be derived from `zinc` and `emerald` variables. No hardcoded hex values in TSX.

## 3. Communication Patterns
- **Multi-Turn Brain**: The Brain (`apps/brain`) must handle recursion. It calls the tool, receives the result, and continues thinking until the task is complete.
- **WebSocket Events**: The `secure-agent-api` must broadcast `event: sandbox:fs_change` on every file write.

## 4. UI/UX (The "Cursor" Bar)
- **Syntax Highlighting**: Must use `vscDarkPlus` with a custom background of `#000` to match the "Deep Black" aesthetic.
- **Action Blocks**: Every tool execution must be rendered as a collapsible badge with a status icon (Running, Success, Error).