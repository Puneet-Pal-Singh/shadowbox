#!/bin/bash
#
# Runtime Conformance Gate (SHA-41)
#
# Validates deterministic runtime behavior, boundary guards, and run isolation.
#

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}[runtime-conformance-gate] Starting checks...${NC}"

echo -e "${YELLOW}[runtime-conformance-gate] Type checking execution-engine and brain...${NC}"
pnpm check-types > /dev/null
echo -e "${GREEN}[runtime-conformance-gate] ✓ Type checks passed${NC}"

echo -e "${YELLOW}[runtime-conformance-gate] Running boundary and parity tests...${NC}"
pnpm --filter @shadowbox/brain test -- portability-guards.test.ts runtime/contracts/portability-boundary.test.ts > /dev/null
pnpm --filter @shadowbox/execution-engine test -- runtime-adapter-boundary.test.ts runtime-core-decomposition.test.ts runtime/lib/RoutingDetector.test.ts runtime/engine/RunManifestPolicy.test.ts > /dev/null
echo -e "${GREEN}[runtime-conformance-gate] ✓ Boundary and parity tests passed${NC}"

echo -e "${YELLOW}[runtime-conformance-gate] Running isolation and retry reliability tests...${NC}"
pnpm --filter @shadowbox/execution-engine test -- runtime/engine/RunEngine.isolation.test.ts runtime/orchestration/TaskScheduler.test.ts > /dev/null
echo -e "${GREEN}[runtime-conformance-gate] ✓ Isolation and retry tests passed${NC}"

echo -e "${GREEN}[runtime-conformance-gate] ✓ All checks passed${NC}"
