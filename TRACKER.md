# Noesis — Test Suite Refactor Complete (2026-06-14)

## Verification
- ✅ `npx tsc --noEmit` — 0 errors
- ✅ `bun test` — 73 pass / 0 fail (8 skipped: require OMP hook lifecycle)
- ✅ Domain contracts: 39 pass / 0 fail
- ✅ Property-based: 7 pass / 0 fail
- ✅ Scenarios: 21 pass / 0 fail
- ⏭️ `bun run smoke:rpc` — OMP 15.12.4 `get_state` doesn't expose extension tools; register scenario needs rework

## New Test Structure
```
test/
  _harness/           — MockExtensionAPI, factories, assertions, fixtures (4 files)
  contracts/          — 12 files, 49 tests
  properties/         — 2 files, 7 tests (100 random seeds each)
  scenarios/          — 7 files, 21 tests
```

## What was done
- [x] Rebuilt test suite from product contracts: every test validates a documented promise
- [x] Added MockExtensionAPI with test-only surface (invokeTool, invokeHook, getTool, getCommand, hookCount)
- [x] Created fixture factories for all state entities (makeFact, makeDecision, makeHypothesis, etc.)
- [x] Created assertion helpers for AGM postulates, confidence, caps, preamble, survivor discipline
- [x] Fixed `loadState` corrupt file recovery (try/catch in filesystem-store.ts)
- [x] Fixed `makeStateWithFacts` array reference sharing bug (now clones arrays)
- [x] Fixed RPC smoke harness: `toolStarted` method, assertion import path, missing scenario functions
- [x] Added `scripts` and `test` to tsconfig includes
- [x] Added `@stryker-mutator/core` + `@stryker-mutator/vitest-runner` dev deps
- [x] Configured vitest coverage thresholds + stryker mutation testing config
- [x] Deleted legacy `test/noesis.test.ts` (all behavior migrated to contract tests)

## Remaining known gaps
- Mutation testing configured but not yet executed
- Walking `walkToActiveHead` not exported; property tests inline their own
