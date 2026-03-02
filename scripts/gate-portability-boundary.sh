#!/bin/bash
#
# Portability Boundary Conformance Gate
#
# Validates that code changes maintain portability boundary adherence.
# Prevents platform leakage and ensures port contracts are honored.
#
# Run as: pnpm gate:portability-boundary
#
# Checks:
# 1. TypeScript compilation succeeds (strict mode)
# 2. Conformance tests pass (port contracts)
# 3. No Cloudflare primitives leak into core
# 4. Port boundary violations detected and reported
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}[portability-boundary-gate] Starting conformance checks...${NC}"

# 1. Type check (strict mode)
echo -e "${YELLOW}[portability-boundary-gate] Checking TypeScript compilation...${NC}"
if ! pnpm run check-types > /dev/null 2>&1; then
  echo -e "${RED}[portability-boundary-gate] ✗ TypeScript compilation failed${NC}"
  echo "Run: pnpm run check-types"
  exit 1
fi
echo -e "${GREEN}[portability-boundary-gate] ✓ TypeScript compilation passed${NC}"

# 2. Run conformance tests
echo -e "${YELLOW}[portability-boundary-gate] Running conformance tests...${NC}"
if ! pnpm --filter @shadowbox/secure-agent-api vitest run --dir src/conformance > /dev/null 2>&1; then
  echo -e "${RED}[portability-boundary-gate] ✗ Conformance tests failed${NC}"
  echo "Run: pnpm --filter @shadowbox/secure-agent-api vitest run --dir src/conformance"
  exit 1
fi
echo -e "${GREEN}[portability-boundary-gate] ✓ Conformance tests passed${NC}"

# 3. Check for cloudflare primitive leakage in core
echo -e "${YELLOW}[portability-boundary-gate] Checking for platform leakage...${NC}"
LEAK_COUNT=0

# Core files should not import from cloudflare:workers or @cloudflare/workers-types
# (except where explicitly needed for type definitions in ports)
CORE_FILES=(
  "apps/secure-agent-api/src/core/"
  "apps/brain/src/runtime/ports/"
)

for FILE_PATTERN in "${CORE_FILES[@]}"; do
  # Check for direct Cloudflare imports in core (excluding adapters)
  if grep -r "from ['\"]cloudflare:" "$FILE_PATTERN" 2>/dev/null | \
     grep -v "adapters" | \
     grep -v "@cloudflare/workers-types" > /dev/null; then
    echo -e "${RED}[portability-boundary-gate] ✗ Cloudflare imports found in core logic${NC}"
    LEAK_COUNT=$((LEAK_COUNT + 1))
  fi
done

if [ $LEAK_COUNT -gt 0 ]; then
  echo -e "${RED}[portability-boundary-gate] ✗ Platform leakage detected (${LEAK_COUNT} violations)${NC}"
  exit 1
fi
echo -e "${GREEN}[portability-boundary-gate] ✓ No platform leakage detected${NC}"

# 4. Summary
echo -e "${GREEN}[portability-boundary-gate] ✓ All conformance checks passed${NC}"
echo -e "${GREEN}[portability-boundary-gate] Portability boundary is maintained${NC}"
exit 0
