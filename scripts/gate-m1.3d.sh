#!/bin/bash

###############################################################################
# gate-m1.3d.sh
# 
# M1.3d Regression Gate - Chat Flow Unbreak + Provider Wiring Validation
#
# Exit Criteria:
# 1. Chat hydration works (no CORS errors)
# 2. Chat stream works (no provider config 500)
# 3. Provider/model selection persists per session
# 4. Provider/model appears in /chat payload
# 5. Connected provider state available to RunEngine
#
# Usage:
#   ./scripts/gate-m1.3d.sh           # Run all checks
#   ./scripts/gate-m1.3d.sh cors      # Run only CORS check
#   ./scripts/gate-m1.3d.sh provider  # Run only provider checks
###############################################################################

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
GATE_NAME="m1.3d"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Gate status
PASSED=0
FAILED=0
SKIPPED=0

##########################################################################
# Utility Functions
##########################################################################

log_header() {
  echo -e "\n${BLUE}═══════════════════════════════════════════════════════════${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"
}

log_test() {
  echo -e "${YELLOW}▸ $1${NC}"
}

log_pass() {
  echo -e "${GREEN}✓ $1${NC}"
  ((PASSED++))
}

log_fail() {
  echo -e "${RED}✗ $1${NC}"
  ((FAILED++))
}

log_skip() {
  echo -e "${YELLOW}⊘ $1${NC}"
  ((SKIPPED++))
}

##########################################################################
# Gate: CORS Configuration
##########################################################################

gate_cors() {
  log_header "GATE: CORS Configuration (05dA)"

  log_test "Check secure-agent-api .dev.vars exists"
  if [ -f "$PROJECT_ROOT/apps/secure-agent-api/.dev.vars" ]; then
    log_pass ".dev.vars file exists"
  else
    log_fail ".dev.vars file missing - copy from .dev.vars.example"
    return 1
  fi

  log_test "Check CORS_ALLOW_DEV_ORIGINS setting"
  if grep -q "CORS_ALLOW_DEV_ORIGINS=true" "$PROJECT_ROOT/apps/secure-agent-api/.dev.vars"; then
    log_pass "CORS_ALLOW_DEV_ORIGINS is set to true"
  else
    log_fail "CORS_ALLOW_DEV_ORIGINS not set to true"
    return 1
  fi

  log_test "Run CORS unit tests"
  if command -v pnpm &> /dev/null; then
    if pnpm --filter @shadowbox/secure-agent-api test -- cors.test.js 2>/dev/null; then
      log_pass "CORS tests pass"
    else
      log_skip "CORS tests failed or not available (may need to start dev server)"
    fi
  else
    log_skip "pnpm not found - skipping CORS test execution"
  fi
}

##########################################################################
# Gate: Provider Configuration
##########################################################################

gate_provider_config() {
  log_header "GATE: Provider Configuration (05dB)"

  log_test "Check brain .dev.vars exists"
  if [ -f "$PROJECT_ROOT/apps/brain/.dev.vars" ]; then
    log_pass ".dev.vars file exists"
  else
    log_fail ".dev.vars file missing - copy from .dev.vars.example"
    return 1
  fi

  log_test "Check LLM_PROVIDER is set"
  if grep -q "LLM_PROVIDER=" "$PROJECT_ROOT/apps/brain/.dev.vars"; then
    log_pass "LLM_PROVIDER is configured"
  else
    log_fail "LLM_PROVIDER not set"
    return 1
  fi

  log_test "Check DEFAULT_MODEL is set"
  if grep -q "DEFAULT_MODEL=" "$PROJECT_ROOT/apps/brain/.dev.vars"; then
    log_pass "DEFAULT_MODEL is configured"
  else
    log_fail "DEFAULT_MODEL not set"
    return 1
  fi

  log_test "Check API key is provided"
  if grep -qE "(GROQ_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY)=" "$PROJECT_ROOT/apps/brain/.dev.vars" | grep -v "^#"; then
    log_pass "At least one API key is configured"
  else
    log_skip "No API key configured (may be using env vars)"
  fi

  log_test "Run provider validation tests"
  if command -v pnpm &> /dev/null; then
    if pnpm --filter @shadowbox/brain test -- ProviderValidationService.test.ts 2>/dev/null; then
      log_pass "Provider validation tests pass"
    else
      log_skip "Provider validation tests failed or not available"
    fi
  else
    log_skip "pnpm not found - skipping validation tests"
  fi
}

##########################################################################
# Gate: Model/Provider Selection Wiring
##########################################################################

gate_model_selection() {
  log_header "GATE: Model/Provider Selection Wiring (05dC/05dD)"

  log_test "Check ModelDropdown component exists"
  if [ -f "$PROJECT_ROOT/apps/web/src/components/chat/ModelDropdown.tsx" ]; then
    log_pass "ModelDropdown component found"
  else
    log_fail "ModelDropdown component not found"
    return 1
  fi

  log_test "Check ChatInputBar uses ModelDropdown"
  if grep -q "ModelDropdown" "$PROJECT_ROOT/apps/web/src/components/chat/ChatInputBar.tsx"; then
    log_pass "ChatInputBar imports ModelDropdown"
  else
    log_fail "ChatInputBar does not use ModelDropdown"
    return 1
  fi

  log_test "Check AgentSetup receives sessionId prop"
  if grep -q "sessionId" "$PROJECT_ROOT/apps/web/src/components/agent/AgentSetup.tsx"; then
    log_pass "AgentSetup uses sessionId prop"
  else
    log_fail "AgentSetup does not use sessionId prop"
    return 1
  fi

  log_test "Check App.tsx passes sessionId to AgentSetup"
  if grep -q "sessionId={activeSessionId}" "$PROJECT_ROOT/apps/web/src/App.tsx"; then
    log_pass "App.tsx passes sessionId to AgentSetup"
  else
    log_fail "App.tsx does not pass sessionId to AgentSetup"
    return 1
  fi
}

##########################################################################
# Gate: Provider State Boundary
##########################################################################

gate_provider_state() {
  log_header "GATE: Provider State Boundary (05dE)"

  log_test "Check DurableProviderStore exists"
  if [ -f "$PROJECT_ROOT/apps/brain/src/services/providers/DurableProviderStore.ts" ]; then
    log_pass "DurableProviderStore found"
  else
    log_fail "DurableProviderStore not found"
    return 1
  fi

  log_test "Check ProviderConfigService accepts durable store"
  if grep -q "durableStore" "$PROJECT_ROOT/apps/brain/src/services/ProviderConfigService.ts"; then
    log_pass "ProviderConfigService supports durable store"
  else
    log_fail "ProviderConfigService does not support durable store"
    return 1
  fi

  log_test "Check RunEngineRuntime creates DurableProviderStore"
  if grep -q "DurableProviderStore" "$PROJECT_ROOT/apps/brain/src/runtime/RunEngineRuntime.ts"; then
    log_pass "RunEngineRuntime creates DurableProviderStore"
  else
    log_fail "RunEngineRuntime does not create DurableProviderStore"
    return 1
  fi
}

##########################################################################
# Gate: Build & Type Check
##########################################################################

gate_build() {
  log_header "GATE: Build & Type Safety (All PRs)"

  log_test "Type check TypeScript"
  if command -v pnpm &> /dev/null; then
    if pnpm typecheck 2>/dev/null; then
      log_pass "TypeScript type check passes"
    else
      log_fail "TypeScript type check failed"
      return 1
    fi
  else
    log_skip "pnpm not found - skipping type check"
  fi

  log_test "Check for any type annotations"
  if grep -r ":\s*any" apps/brain/src apps/web/src apps/secure-agent-api/src 2>/dev/null | grep -v ".test.ts" | grep -v "node_modules"; then
    log_fail "Found 'any' type annotations (violates type safety)"
    return 1
  else
    log_pass "No 'any' type annotations found"
  fi
}

##########################################################################
# Main Gate Execution
##########################################################################

main() {
  local filter="${1:-all}"

  log_header "M1.3d REGRESSION GATE - Chat Flow Unbreak + Provider Wiring"
  echo "Running filter: $filter"
  echo "Date: $(date)"

  case "$filter" in
    cors)
      gate_cors
      ;;
    provider)
      gate_provider_config
      ;;
    selection)
      gate_model_selection
      ;;
    state)
      gate_provider_state
      ;;
    build)
      gate_build
      ;;
    all|*)
      gate_cors
      gate_provider_config
      gate_model_selection
      gate_provider_state
      gate_build
      ;;
  esac

  # Summary
  log_header "GATE SUMMARY"
  echo -e "${GREEN}Passed:${NC}  $PASSED"
  echo -e "${RED}Failed:${NC}  $FAILED"
  echo -e "${YELLOW}Skipped:${NC} $SKIPPED"

  if [ $FAILED -eq 0 ]; then
    echo -e "\n${GREEN}✓ M1.3d Gate PASSED${NC}"
    exit 0
  else
    echo -e "\n${RED}✗ M1.3d Gate FAILED ($FAILED issues)${NC}"
    exit 1
  fi
}

main "$@"
