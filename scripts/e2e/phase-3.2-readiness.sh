#!/usr/bin/env bash

set -euo pipefail

echo "[phase-3.2] Running readiness gates..."

pnpm --filter @shadowbox/brain check-types
pnpm --filter @shadowbox/brain test
pnpm --filter @shadowbox/secure-agent-api check-types

if [[ "${RUN_SECURE_AGENT_API_TESTS:-0}" == "1" ]]; then
  pnpm --filter @shadowbox/secure-agent-api test
else
  echo "[phase-3.2] Skipping @shadowbox/secure-agent-api tests."
  echo "[phase-3.2] Set RUN_SECURE_AGENT_API_TESTS=1 when runtime integration endpoint is available."
fi

pnpm --filter @shadowbox/execution-engine type-check

if [[ "${RUN_EXECUTION_ENGINE_TESTS:-0}" == "1" ]]; then
  pnpm --filter @shadowbox/execution-engine test
else
  echo "[phase-3.2] Skipping @shadowbox/execution-engine tests."
  echo "[phase-3.2] Set RUN_EXECUTION_ENGINE_TESTS=1 to include full execution-engine suite."
fi

echo "[phase-3.2] All readiness gates passed."
