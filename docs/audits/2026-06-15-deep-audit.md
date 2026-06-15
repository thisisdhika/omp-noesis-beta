# omp-noesis v0.1.0 — Deep Codebase Audit

**Date:** 2026-06-15
**Type:** Comprehensive (architecture, code quality, schema, tests, security, docs)
**Method:** 6 parallel subagent reviews + orchestrator analysis
**Baseline:** 536 tests pass, 0 fail, 94.99% lines, 91.93% functions, tsc --noEmit clean

---

## Executive Summary

omp-noesis is a well-structured v0.1.0 with a solid architectural foundation, thorough type safety, and good test coverage. However, the audit revealed **5 critical bugs**, **17 high-severity issues**, and widespread documentation-code drift that must be addressed before claiming production readiness.

The codebase falls into a pattern common to early-stage cognitive substrates: rigorous design documentation that outpaces implementation fidelity. The docs describe a precise, formal system (AGM belief revision, confidence mapping tables, ranking formulas), but the code implements simplified or divergent versions of these contracts.

### Severity Distribution

| Severity | Count | Impact |
|----------|-------|--------|
| CRITICAL | 5 | Data loss, wrong confidence values, broken ranking |
| HIGH | 17 | Dead features, missing error recovery, doc-code divergence |
| MEDIUM | 55+ | Dead code, magic numbers, consistency gaps |
| LOW | 30+ | Style, naming, minor portability |

---

## 1. Critical Findings

### 1.1 Concurrent mutation data loss in StateManager (Security C1)

**Files:** `src/infrastructure/state-manager.ts:57-62`, `:70-77`
**Impact:** Silent data loss when two async mutations interleave

`StateManager.mutate()` and `checkpointAttention()` write state to disk without synchronization. JavaScript's event loop makes synchronous blocks atomic, but interleaving at `await` boundaries allows write reordering. The last `renameSync` to finish wins — the other caller's state changes are silently discarded.

**Exploit scenario:** `tool_result` hook calls `mutate()` concurrently with a tool execution's `mutate()`. Both mutate in-memory state correctly, but the on-disk result depends on race timing of temp file renames.

**Fix:** Implement a mutex (e.g., `async-mutex`) over the write path.

### 1.2 Confidence mapping: EXTRACTED → 0.9 instead of doc 1.0 (Schema C1)

**File:** `src/domains/belief/confidence-strategy.ts:37`
**Impact:** All graph-extracted beliefs get 0.9 instead of documented 1.0

Five documents (STATE_SCHEMA.md, BOUNDARY_MATRIX.md, GRAPHIFY_CONTRACT.md, BELIEF_REVISION.md, APPEND_SYSTEM.md) all specify EXTRACTED → 1.0. The code uses 0.9. This permanently reduces standing in downstream decisions, ranking, and survivor eligibility.

**Fix:** Change line 37 to `base = 1.0;` to match documented contract.

### 1.3 Confidence mapping: INFERRED floor at 0.7 inflates low-confidence findings (Schema C2)

**File:** `src/domains/belief/confidence-strategy.ts:40-41`
**Impact:** INFERRED 0.55 and 0.65 findings map to 0.7 instead of their documented values

The code uses `Math.max(0.7, inferredConfidence)`, effectively flooring all INFERRED findings at 0.7. The documented tiered mapping (0.55→0.55, 0.65→0.65, 0.75→0.75, etc.) is never applied. All low-confidence findings are artificially inflated.

**Fix:** Use direct `inferredConfidence` value if present; fall back to 0.7 only when absent.

### 1.4 Stale penalty is multiplicative (×0.85) instead of additive (-0.10) (Schema C3)

**File:** `src/domains/belief/confidence-strategy.ts:81`
**Impact:** Mathematical divergence: 0.95×0.85=0.8075 (doc says 0.85), 0.75×0.85=0.6375 (doc says 0.65)

The documented contract specifies an additive -0.10 penalty. The code multiplies by 0.85, producing different values at every confidence tier. All stale beliefs are penalized incorrectly.

**Fix:** Change to `adjusted = Math.max(0.55, adjusted - 0.10);`

### 1.5 Ranking formula completely divergent from STATE_SCHEMA §7.1 (Schema C4)

**File:** `src/domains/learning/ranking-strategy.ts:34-38`
**Impact:** Every learning entry's rank is computed with a different formula than documented

| Factor | Documented | Actual Code |
|--------|-----------|-------------|
| recency | Position-based: decays 0.2 per older sibling | Time-bucketed: ≤24h→1.0, ≤7d→0.5, >7d→0.1 |
| taskRelevance | 1.0/0.5/0.0 by domain | Always 1.0 (hardcoded) |
| failureMultiplier | 2.0 for failures | 1.5 for failures |
| resolvedFixMultiplier | 2.0 if rootCause+fix present | 2.0 if status==="resolved" |

**Fix:** Rewrite `computeRank` and `getRecency` to match documented behavior, or update documentation.

---

## 2. High-Severity Issues

### 2.1 Capability level always "DEGRADED" in context hook (CodeQuality H2)

**File:** `src/hooks/context-hook.ts:26`
`capabilityLevel: "DEGRADED"` is hardcoded. The preamble ALWAYS shows "[Noesis: DEGRADED — limited operation]" regardless of actual Graphify availability. This is a feature-breaking bug — Graphify integration appears non-functional when it works correctly.

### 2.2 N+1 disk writes in attend-tool (CodeQuality H3)

**File:** `src/tools/attend-tool.ts:42,60`
Each graph query triggers a separate `mutate()` call, generating up to 6 sequential atomic disk writes for a single `noesis_attend` call. Inconsistent intermediate state is visible on disk between writes.

### 2.3 Silent state destruction in StateManager.initialize() (CodeQuality H5)

**File:** `src/infrastructure/state-manager.ts:41-44`
Every error type triggers fallback to EMPTY_STATE, which is then persisted — destroying existing cognitive state. Should differentiate between recoverable errors (corrupt JSON → rebuild) and unrecoverable (disk full → rethrow).

### 2.4 Error recovery gap: preserveData.noesis not consulted (Security H2)

**File:** `src/infrastructure/state-manager.ts:32-45`
ARCHITECTURE.md §8 states corrupt state should "restore from preserveData.noesis or start EMPTY_STATE", but the code unconditionally falls back to EMPTY_STATE without checking the preserveData snapshot from compaction.

### 2.5 Vault-retry buffer defined but never wired (Security H3)

**File:** `src/vault/vault-retry.ts`
RetryBuffer is a complete on-disk retry queue, but no vault store implementation uses it. Failed vault writes silently lose artifacts.

### 2.6 Section-formatters.ts: 175 lines of dead production code (CodeQuality H6)

**File:** `src/rendering/section-formatters.ts`
Eight exported formatters (formatFocus, formatWorkflow, etc.) — zero production imports. Preamble builder has its own inline implementations that produce different output strings. Only used by tests.

### 2.7 Graphify-engine.ts: 97 lines of dead production code (CodeQuality H7)

**File:** `src/infrastructure/graphify-engine.ts`
`enrichFindings` and `toBeliefCandidates` never imported by production code. Pipeline infrastructure designed to bridge graph findings into beliefs, never wired.

### 2.8 Survivor builder shows 5 beliefs vs documented 10 (Schema H2)

**File:** `src/rendering/survivor-builder.ts:39`
`buildBeliefs()` slices to `.slice(0, 5)`. STATE_SCHEMA.md §7.2, APPEND_SYSTEM.md, and ARCHITECTURE.md §7.2 all say 10. CAPS.beliefs is 10. Preamble builder correctly uses 10 for non-compaction path.

### 2.9 Graphify parser doesn't extract sub-confidence/community/godNodes (Schema H3)

**File:** `src/infrastructure/graphify-parser.ts:150-158`
The parser constructs GraphFindings with only `{ query, nodes, relations, confidence, timestamp }`. Fields `inferredConfidence`, `community`, `godNodes`, `surprisingConnections`, `rawOutput` are never populated. The entire INFERRED sub-confidence pipeline is dead.

### 2.10 Path traversal via unvalidated artifact.id (Security H1)

**File:** `src/vault/obsidian-vault-store.ts:240-247`
VaultArtifactSchema.id has no regex constraint. The ID is interpolated into filenames: `${artifact.id}.md`. If id = `../../malicious`, path traversal escapes `.obsidian/noesis/{kind}/`.

### 2.11 supersede() doesn't update updatedAt (Schema H1)

**File:** `src/domains/belief/revision-strategy.ts:39-40`
BELIEF_REVISION.md §4 requires `O.updatedAt = now()` when superseding. The code only sets `status` and `supersededBy`. Audit trail timestamps reflect creation time, not supersession time.

### 2.12 Behaviorial tests are 60% missing (TestQuality)

TESTING_STRATEGY.md documents 10 behavioral scenarios. Only 4 exist — and even those are mislabeled (they test domain functions, not multi-turn agent simulations). Missing: Graphify Grounding, Smart Zone, Skill Effectiveness, Vault Projection, Cross-Session Recall, Double-Preamble Guard.

### 2.13 Obsidian backend essentially untested (TestQuality)

`obsidian-vault-store.ts` (4.88% line coverage) and `obsidian-writer.ts` (16.67% lines) are nearly untested. Non-trivial YAML frontmatter parsing, atomic file writing, and search logic are unverified.

### 2.14 Documentation-code file naming drift (DocAlignment)

ARCHITECTURE.md and IMPLEMENTATION_GUIDE.md reference files with `-command.ts` suffix (attend-command.ts, etc.). Actual files use `-tool.ts` (attend-tool.ts, etc.). Two hook files lack `-hook` suffix in docs (before-agent-start.ts vs before-agent-start-hook.ts). IMPLEMENTATION_GUIDE.md refers to nonexistent files (percept.ts, status.ts, loop.ts, render.ts, engine.ts).

### 2.15 Confidence values wrong in 5+ doc files (DocAlignment)

Five documents (STATE_SCHEMA.md, BOUNDARY_MATRIX.md, GRAPHIFY_CONTRACT.md, BELIEF_REVISION.md, APPEND_SYSTEM.md) show EXTRACTED→1.0, INFERRED tiered mapping, additive stale penalty. The code uses EXTRACTED→0.9, INFERRED→0.7 flat, multiplicative stale penalty. All docs must be synchronized with actual code behavior or code must be fixed to match docs.

---

## 3. Medium-Severity Issues (Selected)

### 3.1 Architecture dependency violations (2)
- `graphify-engine.ts` imports from `domains/belief/` violating infrastructure→schema/shared rule
- `vault-retry.ts` imports from `infrastructure/filesystem-store.js` violating vault→schema/shared rule

### 3.2 Duplicated validation in tools (believe, commit, infer)
Each tool defines param schemas inline via `pi.zod.object()` duplicating `schema.ts` canonical schemas. The `.refine()` validation and manual checks in `execute()` bodies duplicate each other. Canonical schemas exported but unused (~150 lines dead code).

### 3.3 Unsafe `as` casts in commit-tool.ts
Three `as` casts on workflow status fields bypass TypeScript type safety.

### 3.4 checkpointAttention bypasses migrations
Reads raw on-disk state, patches attention, writes back without running `migrate()`. Schema version increments would be silently bypassed.

### 3.5 Tool-result hook captures EVERY tool result
Records learning entries for all tool executions, violating APPEND_SYSTEM.md gotcha: "Do not capture every tool result. Only significant events become learning."

### 3.6 Obsidian vault structure differs from docs
OBSIDIAN_CONTRACT.md says files at `Noesis/noesis-decision-{id}.md` (flat, prefixed). Code writes to `.obsidian/noesis/{kind}/{id}.md` (subdirectories, unprefixed).

### 3.7 TROUBLESHOOTING.md references nonexistent commands
Lists `omp noesis status`, `omp noesis preamble`, `omp noesis validate-state`, `omp noesis reset` — none of these CLI commands exist.

### 3.8 SETUP.md describes config that doesn't exist
Claims `/noesis:init` creates `.omp/config.yml` — it only creates `.omp/noesis/` directory and state.json.

### 3.9 Smoke test hardcoded absolute paths
`tests/smoke/config.ts:10` has `SMOKE_WORKDIR` hardcoded to a specific developer's workspace path.

### 3.10 Fossil test assertions
`tests/integration/tools.test.ts:77` uses `expect(pi._toolCount()).toBe(7)` — fragile magic number that breaks silently when tools are added/removed.

### 3.11 Component diagram references nonexistent files
ARCHITECTURE.md §2 diagram lists `percept.ts`, `status.ts`, `loop.ts`, `patterns`, `render.ts`, `engine.ts` — none of these files exist.

---

## 4. Recommendations

### Immediate (blocking for production readiness)
1. **Fix StateManager concurrency** (CRITICAL — data loss risk): Add mutex
2. **Align confidence mapping with documented contract**: EXTRACTED→1.0, INFERRED tiered, additive stale penalty
3. **Fix ranking formula**: Rewrite to match STATE_SCHEMA.md §7.1
4. **Fix context hook capability level**: Replace hardcoded "DEGRADED" with actual detection
5. **Fix observer state inconsistency**: Attend-tool batch mutations, survivor belief cap, supersede updatedAt

### Short-term (quality hardening)
6. **Delete dead code**: section-formatters.ts (175 lines), graphify-engine.ts (97 lines) or wire them in
7. **Synchronize docs with code**: Fix all file naming, path structure, and configuration references
8. **Add missing behavioral tests**: 6 of 10 scenarios unimplemented
9. **Test Obsidian backend**: Currently 4.88% coverage for a production backend
10. **Wire vault retry buffer**: Currently defined but unused

### Medium-term (operational excellence)
11. **Consolidate tool parameter schemas**: Eliminate ~150 lines of dead schema exports
12. **Remove unsafe casts**: Replace `as` casts with proper Zod narrowing
13. **Fix checkpointAttention migration bypass**
14. **Add error recovery from preserveData snapshot**
15. **Fix path traversal risk in ObsidianVaultStore**

---

## 5. What's Good

Despite the issues, the codebase has strong fundamentals:

- **Architecture:** Clean domain separation, single mutation bottleneck (StateManager), correct layering in all production paths
- **Type safety:** TypeScript strict mode, no `any` annotations in production code, Zod v4 validation throughout
- **Test coverage:** 94.99% lines, 91.93% functions, 536 tests across 41 files
- **Security posture:** No command injection (all Bun.spawn with argument arrays), atomic file writes, parameterized SQL
- **Documentation quality:** 9 specification documents with clear contracts — the content is excellent, even if some specifics are out of date
- **AGM compliance:** Correctly implements K*2-K*6 at the belief-base level with proper supersession chains
- **No OMP/Graphify boundary violations:** All integration points correctly delegate to external systems

---

## 6. Verification

```
TypeScript:  bun run typecheck  → 0 diagnostics ✅
Tests:       bun test           → 536 pass, 0 fail ✅
Coverage:    94.99% lines, 91.93% functions ✅
```

---

*Audit performed by 6 parallel reviewer subagents + orchestrator synthesis. Each finding backed by file:line references in source agent outputs.*
