# 50 - OpenCode Responses Adoption LLD

## Objective

Implement the HLD in small, test-gated units that unblock reliable chat responses before deeper BYOK work.

## Implementation Tracks

### Track 1: Routing Reliability (PR-50A)

Files:
1. `apps/brain/src/controllers/ChatController.ts`
2. `apps/brain/src/services/chat/ChatIntentDetector.ts`
3. `packages/execution-engine/src/runtime/engine/RunEngine.ts`
4. `packages/execution-engine/src/runtime/orchestration/TaskScheduler.ts`

Tasks:
1. Normalize prompt extraction from structured user content parts.
2. Align conversational bypass heuristics between Brain and RunEngine.
3. Ensure non-DONE executor results become FAILED task states.
4. Add structured routing logs (`bypass`, `planning`, `reason`).

Tests:
1. `apps/brain/src/controllers/ChatController.test.ts`
2. `apps/brain/src/services/chat/ChatIntentDetector.test.ts`
3. `packages/execution-engine/src/runtime/engine/RunEngine.test.ts`
4. `packages/execution-engine/src/runtime/orchestration/TaskScheduler.test.ts`

Exit criteria:
1. `hey` and `great` bypass planning.
2. action prompts still route to planning.
3. failed tool execution is never marked DONE.

### Track 2: Event Envelope Streaming (PR-50B)

Files:
1. `packages/execution-engine/src/runtime/engine/RunEngine.ts`
2. `apps/web/src/hooks/useChatCore.ts`
3. `apps/web/src/components/chat/*` (event-driven rendering)

Tasks:
1. Introduce NDJSON event envelope:
2. `text-delta`, `tool-call`, `tool-result`, `tool-error`, `run-status`, `final`.
3. Keep backward-compatible text stream fallback behind feature flag.
4. Surface tool-in-progress events in UI.

Tests:
1. contract tests for stream shape and order,
2. UI integration test for visible tool progress,
3. fallback compatibility test.

Exit criteria:
1. user sees progress while tool calls run,
2. no hidden long-running loops,
3. deterministic final event emitted once.

### Track 3: Bounded Agentic Loop (PR-50C)

Files:
1. `packages/execution-engine/src/runtime/engine/AgenticLoop.ts` (new)
2. `packages/execution-engine/src/runtime/engine/RunEngine.ts`
3. `packages/execution-engine/src/runtime/stops/*`

Tasks:
1. Add loop with max-steps and stop-reason contract.
2. Execute tools inline and feed results back to LLM.
3. Preserve budget checks before each model/tool iteration.
4. Gate by feature flag for staged rollout.

Tests:
1. step-limit enforcement,
2. repeated tool-call protection,
3. budget-exceeded stop behavior,
4. provider-agnostic loop behavior.

Exit criteria:
1. loop cannot run indefinitely,
2. stop reason always explicit,
3. no regression in existing plan-first path when flag is off.

### Track 4: Provider Parity and Freeze (PR-50D)

Files:
1. `packages/shared-types/*` (event DTOs)
2. `apps/brain/src/runtime/*` (boundary validators)
3. provider adapter tests

Tasks:
1. freeze response event DTOs for v1.
2. add cross-provider parity suite.
3. enforce compatibility checks in CI.

Tests:
1. parity matrix for OpenAI/OpenRouter/Groq/Anthropic path,
2. snapshot tests for response envelopes,
3. error envelope conformance tests.

Exit criteria:
1. same prompt class yields same response semantics across providers,
2. clients consume one stable response protocol,
3. BYOK phase progression unlocked.

## Rollout and Risk Controls

1. Feature flags:
2. `CHAT_EVENT_STREAM_V1`
3. `CHAT_AGENTIC_LOOP_V1`

4. Rollback:
5. flag-off returns to current stable path.

6. Metrics:
7. planning-rate for conversational prompts,
8. tool-call-rate per message,
9. failed-vs-done task ratio,
10. p95 first-token latency,
11. p95 final-response latency.

## Definition of Done

1. All track exit criteria pass.
2. Typecheck and targeted tests pass in brain and execution-engine.
3. Manual smoke runs pass:
4. `hey`, `great`, `read this readme`, provider switch + chat.
