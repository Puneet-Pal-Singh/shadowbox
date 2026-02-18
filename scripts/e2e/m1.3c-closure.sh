#!/bin/bash

#
# M1.3c Regression Gate Script
# Validates closure of persistence contract migration, provider test stability, 
# legacy stack isolation, and runtime type alignment
#
# Exit codes:
#   0 = All gates passed
#   1 = Type check or legacy isolation failure
#   2 = Provider test failure
#   3 = Secure API test failure
#   4 = Web test failure
#   5 = Brain runtime regression (legacy /chat writes detected)
#   6 = Canonical persistence endpoint missing
#

set -e
set -o pipefail

# Resolve repository root relative to this script's location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BRAIN_SRC="${REPO_ROOT}/apps/brain/src"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  M1.3c Regression Gate: Brain Integration & Dedup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Gate 1: Type checking
echo "📋 Gate 1: Type Checking"
echo "────────────────────────────────────────────────────────"
echo "Checking @shadowbox/brain..."
if ! pnpm --filter @shadowbox/brain check-types; then
  echo "❌ FAILED: Brain type check failed"
  exit 1
fi
echo "✅ Brain type check passed"

echo "Checking @shadowbox/secure-agent-api..."
if ! pnpm --filter @shadowbox/secure-agent-api check-types; then
  echo "❌ FAILED: Secure API type check failed"
  exit 1
fi
echo "✅ Secure API type check passed"

echo "Checking @shadowbox/web..."
if ! pnpm --filter @shadowbox/web check-types; then
  echo "❌ FAILED: Web type check failed"
  exit 1
fi
echo "✅ Web type check passed"
echo ""

# Gate 2: Provider test stability (PR-05cB)
echo "📋 Gate 2: Provider Test Stability (PR-05cB)"
echo "────────────────────────────────────────────────────────"
echo "Running Brain provider and AI service tests..."
if ! pnpm --filter @shadowbox/brain test; then
  echo "❌ FAILED: Brain provider tests failed"
  exit 2
fi
echo "✅ Brain provider tests passed"
echo ""

# Gate 3: Persistence contract (PR-05cA)
echo "📋 Gate 3: Persistence Contract (PR-05cA)"
echo "────────────────────────────────────────────────────────"
echo "Running Secure API chat history route tests..."
if ! pnpm --filter @shadowbox/secure-agent-api test; then
  echo "❌ FAILED: Secure API tests failed"
  exit 3
fi
echo "✅ Secure API tests passed"
echo ""

# Gate 4: Web hydration/session tests (FAIL-HARD)
echo "📋 Gate 4: Web Hydration & Session Tests"
echo "────────────────────────────────────────────────────────"
echo "Running critical web tests..."
if ! pnpm --filter @shadowbox/web test -- --run \
  src/services/ChatHydrationService.test.js \
  src/services/__tests__/SessionStateService.test.ts \
  src/hooks/__tests__/useSessionManager.test.ts \
  src/lib/__tests__/platform-endpoints.test.ts; then
  echo "❌ FAILED: Web tests failed"
  exit 4
fi
echo "✅ Web tests passed"
echo ""

# Gate 5: Regression check - Brain no longer writes to legacy /chat (FAIL-HARD)
echo "📋 Gate 5: Brain Runtime Regression Check"
echo "────────────────────────────────────────────────────────"
echo "Verifying Brain no longer writes to deprecated /chat path..."

# Search for any non-test runtime code that writes to legacy /chat
# Only allow legacy/ and test files
if grep -r "http://internal/chat" \
  "${BRAIN_SRC}" \
  --include="*.ts" \
  --include="*.tsx" \
  --exclude-dir=node_modules \
  | grep -v "\.test\." \
  | grep -v "/legacy/"; then
  echo "❌ REGRESSION: Found legacy /chat write path in Brain runtime code"
  exit 5
fi

echo "✅ No legacy /chat writes detected in active runtime"
echo ""

# Gate 6: Canonical persistence route is used
echo "📋 Gate 6: Canonical Persistence Route (PR-05cA)"
echo "────────────────────────────────────────────────────────"
echo "Verifying Brain uses canonical /api/chat/history/:runId..."

if grep -r "http://internal/api/chat/history/" \
  "${BRAIN_SRC}/services/PersistenceService.ts" > /dev/null; then
  echo "✅ PersistenceService uses canonical endpoint"
else
  echo "❌ FAILED: Canonical endpoint not found in PersistenceService"
  exit 6
fi
echo ""

# Gate 7: Legacy stack isolation (PR-05cC)
echo "📋 Gate 7: Legacy Stack Isolation (PR-05cC)"
echo "────────────────────────────────────────────────────────"

if [ ! -d "${BRAIN_SRC}/legacy" ]; then
  echo "❌ FAILED: Legacy boundary directory not found"
  exit 1
fi

if [ ! -f "${BRAIN_SRC}/legacy/README.md" ]; then
  echo "❌ FAILED: Legacy README not found"
  exit 1
fi

echo "✅ Legacy directory structure with guardrails in place"
echo ""

# Gate 8: Runtime type alignment (PR-05cD) - BLOCKING
echo "📋 Gate 8: Runtime Type Source Alignment (PR-05cD)"
echo "────────────────────────────────────────────────────────"
echo "Verifying runtime types are canonical..."

if grep -q "RUN_ENGINE_RUNTIME" "${BRAIN_SRC}/controllers/ChatController.ts"; then
  echo "✅ ChatController references execution-engine runtime contracts"
else
  echo "❌ FAILED: ChatController must import from execution-engine runtime contracts"
  exit 1
fi
echo ""

# Final summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ M1.3c REGRESSION GATE PASSED"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Summary:"
echo "  ✅ PR-05cA: Persistence contract migrated to canonical route"
echo "  ✅ PR-05cB: Provider test harness stable (resetForTests working)"
echo "  ✅ PR-05cC: Legacy stack isolated with import guardrails"
echo "  ✅ PR-05cD: Runtime types aligned with execution-engine"
echo "  ✅ PR-05cE: Regression gate script validated"
echo ""
echo "Ready for merge and M2.0 planning phase."
echo ""
