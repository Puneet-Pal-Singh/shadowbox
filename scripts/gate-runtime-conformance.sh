#!/bin/bash
#
# Runtime Conformance Gate (SHA-41)
#
# Validates deterministic runtime behavior, provider parity, boundary guards,
# fallback policy, observability, and run isolation.
#

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}[runtime-conformance-gate] Starting checks...${NC}"

echo -e "${YELLOW}[runtime-conformance-gate] Type checking workspace...${NC}"
pnpm check-types
echo -e "${GREEN}[runtime-conformance-gate] ✓ Type checks passed${NC}"

echo -e "${YELLOW}[runtime-conformance-gate] Running boundary + fallback policy checks...${NC}"
pnpm --filter @shadowbox/brain test -- src/architecture/portability-guards.test.ts src/runtime/contracts/portability-boundary.test.ts src/architecture/no-silent-fallbacks.test.ts > /dev/null
pnpm --filter @shadowbox/execution-engine test -- tests/unit/runtime-adapter-boundary.test.ts tests/unit/runtime-core-decomposition.test.ts > /dev/null
echo -e "${GREEN}[runtime-conformance-gate] ✓ Boundary + fallback policy checks passed${NC}"

echo -e "${YELLOW}[runtime-conformance-gate] Running determinism + provider parity checks...${NC}"
pnpm --filter @shadowbox/execution-engine test -- src/runtime/lib/RoutingDetector.test.ts src/runtime/engine/RunManifestPolicy.test.ts src/runtime/llm/LLMGateway.provider-matrix.test.ts src/runtime/engine/RunEngine.test.ts > /dev/null
echo -e "${GREEN}[runtime-conformance-gate] ✓ Determinism + provider parity checks passed${NC}"

echo -e "${YELLOW}[runtime-conformance-gate] Running observability + parity smoke checks...${NC}"
pnpm --filter @shadowbox/brain test -- src/core/observability/ByokObservability.test.ts src/runtime/parity-smoke.test.ts > /dev/null
echo -e "${GREEN}[runtime-conformance-gate] ✓ Observability + parity smoke checks passed${NC}"

echo -e "${YELLOW}[runtime-conformance-gate] Running isolation + retry reliability checks...${NC}"
pnpm --filter @shadowbox/execution-engine test -- src/runtime/engine/RunEngine.isolation.test.ts src/runtime/orchestration/TaskScheduler.test.ts > /dev/null
echo -e "${GREEN}[runtime-conformance-gate] ✓ Isolation + retry reliability checks passed${NC}"

echo -e "${GREEN}[runtime-conformance-gate] ✓ All checks passed${NC}"
