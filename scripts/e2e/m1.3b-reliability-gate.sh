#!/usr/bin/env bash

set -euo pipefail

echo "[m1.3b-gate] Running brain runtime override coverage"
pnpm --filter @shadowbox/brain test -- --run \
  src/controllers/ChatController.test.ts \
  src/services/AIService.test.ts

echo "[m1.3b-gate] Running execution-engine task-phase propagation coverage"
pnpm --filter @shadowbox/execution-engine test -- --run \
  src/runtime/agents/CodingAgent.test.ts \
  src/runtime/agents/ReviewAgent.test.ts

echo "[m1.3b-gate] Running secure-agent-api hydration route coverage"
pnpm --filter @shadowbox/secure-agent-api exec vitest run \
  src/lib/cors.test.ts \
  src/index.chat-history.test.ts

echo "[m1.3b-gate] Running web session and git stage/unstage reliability coverage"
pnpm --filter @shadowbox/web test -- --run \
  src/hooks/__tests__/useSessionManager.test.ts \
  src/services/__tests__/SessionStateService.test.ts \
  src/lib/__tests__/platform-endpoints.test.ts \
  src/components/sidebar/ChangesPanel.test.tsx

echo "[m1.3b-gate] PASS"
