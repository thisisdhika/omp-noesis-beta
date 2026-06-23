#!/usr/bin/env bash
set -euo pipefail

# omp-noesis: Real OMP Smoke Test
# Exercises every tool against a minimal OMP extension load.
# Usage: bash tests/smoke.sh

echo "=== omp-noesis Smoke Test ==="
echo ""

# 1. Verify dependencies
echo "--- Checking dependencies ---"
bun --version 2>/dev/null || { echo "FAIL: bun not found"; exit 1; }
echo "OK: bun $(bun --version)"

# 2. Typecheck
echo "--- Running typecheck ---"
bun run typecheck 2>&1 | tail -1
echo "OK: typecheck passes"

# 3. Full test suite
echo "--- Running full test suite ---"
bun test --isolate --coverage 2>&1 | tail -5
echo "OK: tests pass"

# 4. Verify extension entry point loads
echo "--- Verifying extension module ---"
bun -e "
  const m = await import('../src/index.ts');
  console.log('Extension factory type:', typeof m.default);
  console.log('Extension exports:', Object.keys(m));
" 2>&1 | grep -v "^$"
echo "OK: extension module loads"

# 5. Verify state file exists
echo "--- Checking state file ---"
if [ -f ".omp/noesis/state.json" ]; then
  STATE_VERSION=$(bun -e "console.log(JSON.parse(require('fs').readFileSync('.omp/noesis/state.json','utf8')).version)")
  echo "OK: state.json version $STATE_VERSION"
else
  echo "WARN: state.json not found (run /noesis:init)"
fi

echo ""
echo "=== Smoke test complete ==="
