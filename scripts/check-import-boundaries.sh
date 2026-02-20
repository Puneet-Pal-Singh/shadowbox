#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_ROOT="$PROJECT_ROOT/apps"

TS_GLOBS=(
  "--glob=*.ts"
  "--glob=*.tsx"
  "--glob=*.js"
  "--glob=*.mjs"
  "--glob=*.cjs"
)

IMPORT_PATTERN='^\s*(import|export)\s+.+from\s+["'"'"'][^"'"'"']*packages\/[^\/]+\/src\/'
REQUIRE_PATTERN='^\s*const\s+.+=\s*require\(\s*["'"'"'][^"'"'"']*packages\/[^\/]+\/src\/'

import_violations="$(rg -n --pcre2 "${TS_GLOBS[@]}" "$IMPORT_PATTERN" "$APP_ROOT" || true)"
require_violations="$(rg -n --pcre2 "${TS_GLOBS[@]}" "$REQUIRE_PATTERN" "$APP_ROOT" || true)"

if [[ -n "$import_violations" || -n "$require_violations" ]]; then
  echo "ERROR: Boundary check failed: deep imports to packages/*/src/* are not allowed from apps/*."
  echo "Use public package exports instead (e.g. @repo/shared-types)."
  if [[ -n "$import_violations" ]]; then
    echo
    echo "[import/export violations]"
    echo "$import_violations"
  fi
  if [[ -n "$require_violations" ]]; then
    echo
    echo "[require violations]"
    echo "$require_violations"
  fi
  exit 1
fi

echo "OK: Boundary check passed: no prohibited deep imports found in apps/*."
