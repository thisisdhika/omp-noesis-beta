# Graphify Integration — Enhancement Todo

> **Generated:** 2026-06-16
> **Source:** Double audit (Architecture + Production Readiness)
> **Auditor A Score:** 7/10 (Architecture & Correctness)
> **Auditor B Score:** 5/10 (Production Readiness & Gaps)
> **Combined Score:** 6/10

---

## Executive Summary

Two independent auditors reviewed all Graphify-related documentation:

1. **Auditor A** (Architecture & Correctness): Found 9 issues in GRAPHIFY_DEEP_DIVE.md — mostly minor accuracy/completeness gaps, 1 critical (duplicated section), 1 important (stale test counts).

2. **Auditor B** (Production Readiness & Gaps): Found 20 issues in GRAPHIFY_BEST_PRACTICES_AUDIT.md and GRAPHIFY_CONTRACT.md — 3 critical (broken capability detection, broken confidence pipeline, missing Priority 0), 6 high (dead schema fields, serial queries, preamble limits, contract mismatches, missing integrity validation, missing version compatibility).

**Bottom line:** The docs are structurally sound but contain aspirational content that doesn't match current code behavior. The most critical gaps are in the data pipeline itself (capability detection + confidence extraction), not in the documentation structure.

---

## Priority 0: Data Pipeline Fixes (Must Fix)

These are the foundation — nothing else works until these are fixed.

### P0-1: Always-DEGRADED capability makes graph integration invisible

**Category:** gap_coverage
**Location:** GRAPHIFY_BEST_PRACTICES_AUDIT.md Section 2
**Description:** Capability detection has bugs: (1) hardcoded DEGRADED was only recently fixed, (2) cached capability never refreshes if graphify becomes available mid-session.
**Recommendation:** Add dedicated finding about capability detection bugs. Add integration test for all 4 levels.

### P0-2: Missing identification of broken confidence pipeline

**Category:** gap_coverage
**Location:** GRAPHIFY_BEST_PRACTICES_AUDIT.md Section 3
**Description:** Parser drops inferredConfidence, causing all INFERRED findings to flatline at 0.7 regardless of actual graph confidence.
**Recommendation:** Add critical finding: parser must extract inferredConfidence from Graphify CLI output.

### P0-3: Priority ordering misses Priority 0 item

**Category:** priority
**Location:** GRAPHIFY_BEST_PRACTICES_AUDIT.md Section 6
**Description:** Capability detection and confidence pipeline must be P0 before any other graph feature works correctly.
**Recommendation:** Add P0: Fix capability detection and confidence pipeline. Restructure all priorities.

---

## Priority 1: Production Hardening (Should Fix)

These improve reliability and user experience.

### P1-1: Section 2 duplicated verbatim

**Category:** accuracy
**Location:** GRAPHIFY_DEEP_DIVE.md Section 2, lines 33–48 and 52–64
**Description:** Lines 33-48 and 52-64 are identical. Copy-paste error.
**Recommendation:** Delete the second occurrence (lines 52-64).

### P1-2: Test count figures significantly outdated

**Category:** staleness
**Location:** GRAPHIFY_DEEP_DIVE.md Section 8, lines 511–541
**Description:** Section 8 test counts are 20-100% outdated vs actual test files.
**Recommendation:** Re-run test counts from actual test files.

### P1-3: Parser drops half the schema fields — dead data path

**Category:** gap_coverage
**Location:** GRAPHIFY_BEST_PRACTICES_AUDIT.md Gap #4
**Description:** 5 of 11 GraphFinding properties are dead code (inferredConfidence, community, godNodes, surprisingConnections, rawOutput).
**Recommendation:** Populate existing schema fields or remove unused ones.

### P1-4: No coverage of query performance: sequential 5×30s execution

**Category:** gap_coverage
**Location:** GRAPHIFY_BEST_PRACTICES_AUDIT.md Section 1
**Description:** Query execution is serial, not parallel. 5 queries × 30s timeout = 2.5 minutes max.
**Recommendation:** Consider Promise.allSettled with concurrency limit (e.g., 3 parallel queries).

### P1-5: No coverage of graph findings eviction and preamble limits

**Category:** gap_coverage
**Location:** GRAPHIFY_BEST_PRACTICES_AUDIT.md Section 2
**Description:** 2-finding display limit and 5-finding storage cap undocumented. Preamble only shows query text, not node count or confidence.
**Recommendation:** Document limits and consider richer preamble display (node count, highest confidence).

### P1-6: Gap #3 recommends Platt scaling — overkill for 3-tier system

**Category:** recommendation
**Location:** GRAPHIFY_BEST_PRACTICES_AUDIT.md Gap #3
**Description:** Platt scaling is overkill; the real bug is parser dropping inferredConfidence.
**Recommendation:** Replace with: extract inferredConfidence, pass through unchanged. Add linear interpolation only if additional shaping needed.

### P1-7: Contract Section 5 doesn't match silent-return behavior

**Category:** contract
**Location:** GRAPHIFY_CONTRACT.md Section 5
**Description:** Contract promises error handling but code returns [].
**Recommendation:** Update contract to match actual behavior: "Any error → [] returned silently."

### P1-8: Contract Section 6 confidence table claims capabilities system doesn't deliver

**Category:** contract
**Location:** GRAPHIFY_CONTRACT.md Section 6
**Description:** Table shows tiered confidence (INFERRED 0.95 → 0.95, etc.) but parser drops inferredConfidence.
**Recommendation:** Update table to show: "INFERRED (any) → 0.70 (parser limitation), stale → 0.60." Or fix code first.

### P1-9: Contract Section 9 error handling matrix promises behavior not implemented

**Category:** contract
**Location:** GRAPHIFY_CONTRACT.md Section 9
**Description:** Matrix promises rawOutput preservation for parse failures but code returns [].
**Recommendation:** Update matrix to match actual behavior. Add rawOutput preservation to backlog.

### P1-10: No graph data integrity validation

**Category:** missing
**Location:** Missing from both documents
**Description:** No JSON schema validation, content hash, or sanity check on graph.json.
**Recommendation:** Implement integrity validation: JSON schema validation on load, content hash comparison, or minimum "nodes.count > 0" check.

### P1-11: No version compatibility contract between Noesis and Graphify CLI

**Category:** missing
**Location:** Missing from both documents
**Description:** No semver validation or format checking between Noesis and Graphify.
**Recommendation:** Add version compatibility check: Graphify CLI --version should return semver that Noesis validates against supported range.

---

## Priority 2: Documentation & Contract Fixes (Nice to Have)

These improve accuracy and reduce confusion.

### P2-1: Circuit breaker doesn't survive compaction or restart

**Category:** recommendation
**Location:** GRAPHIFY_BEST_PRACTICES_AUDIT.md Gap #2
**Description:** In-memory circuit breaker state lost on compaction.
**Recommendation:** Persist circuit breaker state to Noesis state store with graphCircuitBreaker field.

### P2-2: Retry logic should integrate with circuit breaker

**Category:** recommendation
**Location:** GRAPHIFY_BEST_PRACTICES_AUDIT.md Gap #5
**Description:** Standalone retry doesn't compose with circuit breaker.
**Recommendation:** Composed pattern: check breaker first, retry on timeout, feed result to breaker.

### P2-3: Retry over-prioritized vs query caching and provenance

**Category:** priority
**Location:** GRAPHIFY_BEST_PRACTICES_AUDIT.md Section 6
**Description:** Query caching is more user-facing than retry.
**Recommendation:** Swap P3/P4: caching before retry. Move provenance up if compliance required.

### P2-4: Industry comparisons don't account for intentional v1 simplification

**Category:** comparison
**Location:** GRAPHIFY_BEST_PRACTICES_AUDIT.md Section 5
**Description:** JSON+NetworkX trades scalability for zero-setup simplicity. Comparisons don't explain when this is the right choice.
**Recommendation:** Add trade-off analysis to each comparison.

### P2-5: Contract Section 8 describes aspirational behavior

**Category:** contract
**Location:** GRAPHIFY_CONTRACT.md Section 8
**Description:** Retrieval-before-read policy not implemented.
**Recommendation:** Label as "Future (v2)" or replace with actual behavior description.

### P2-6: No graph query budget / output size limits documented

**Category:** missing
**Location:** Missing from both documents
**Description:** token_budget and depth parameters not documented. Noesis doesn't pass explicit budgets.
**Recommendation:** Document parameters and recommend explicit budgets. Consider CAPS.graphQueryTokenBudget.

### P2-7: No analysis of graph findings as attack surface

**Category:** missing
**Location:** Missing from both documents
**Description:** graph.json is trusted local artifact but no integrity verification.
**Recommendation:** Add security consideration: validate source_file paths within project tree, add "last verified build" timestamp.

---

## Priority 3: Minor Improvements (Optional)

Low-impact improvements that can be done anytime.

### P3-1: graphifyVersion always renders '?' in capability block

**Category:** accuracy
**Location:** GRAPHIFY_DEEP_DIVE.md Section 4.4
**Description:** Version detection not wired into preamble render context.
**Recommendation:** Wire graphifyVersion or update doc to note always '?'.

### P3-2: Confidence mapping implies automatic pipeline but code requires manual agent input

**Category:** accuracy
**Location:** GRAPHIFY_DEEP_DIVE.md Section 5
**Description:** Section 5 shows a formula but agent must manually apply it.
**Recommendation:** Clarify agent responsibility or mark as future enhancement.

### P3-3: No auto-update for stale graphs exists in code

**Category:** accuracy
**Location:** GRAPHIFY_CONTRACT.md Section 7
**Description:** Contract claims auto-update but code doesn't implement it.
**Recommendation:** Remove auto-update claim or add future qualifier.

### P3-4: contextUsage field not documented

**Category:** completeness
**Location:** GRAPHIFY_DEEP_DIVE.md Section 4.8
**Description:** Attention schema has contextUsage field not mentioned in docs.
**Recommendation:** Add brief description of contextUsage.

### P3-5: confidence-strategy.ts not referenced

**Category:** completeness
**Location:** GRAPHIFY_DEEP_DIVE.md Section 5
**Description:** Module exists with matching logic but not mentioned in docs.
**Recommendation:** Add reference in file-by-file breakdown.

### P3-6: Capability cache lifetime not described

**Category:** depth
**Location:** GRAPHIFY_DEEP_DIVE.md Section 4.5
**Description:** Cache persists for entire session but this isn't documented.
**Recommendation:** Add note about cache lifetime and session boundary.

### P3-7: Two independent capability indicators not explained

**Category:** depth
**Location:** GRAPHIFY_DEEP_DIVE.md Section 4.4 + Section 3.7a
**Description:** before_agent_start footer vs context-hook preamble section 1.
**Recommendation:** Add clarifying note about the two indicators.

### P3-8: AgentOS comparison omits responsibility boundaries

**Category:** comparison
**Location:** GRAPHIFY_BEST_PRACTICES_AUDIT.md Section 5
**Description:** Which gaps should Noesis fill vs Graphify upstream?
**Recommendation:** Add brief analysis of responsibility boundaries.

---

## Implementation Phases

### Phase 1: Fix Data Pipeline (P0)

1. Fix capability detection — remove hardcoded DEGRADED, add session-aware caching
2. Wire parser to extract inferredConfidence from Graphify CLI output
3. Add integration tests for all 4 capability levels
4. Verify confidence values flow through to noesis_believe correctly

**Verification:** Run `bun test` — all graphify tests pass, preamble shows correct capability level.

### Phase 2: Production Hardening (P1)

1. Add error visibility to query() — return {findings, error?, duration}
2. Add circuit breaker with 3-failure threshold
3. Add query caching (5min TTL)
4. Add provenance tracking (graphVersion, graphMtime, sourceHash)
5. Populate dead schema fields or remove them
6. Add graph data integrity validation
7. Add version compatibility check

**Verification:** Run `bun test` — all new tests pass, error cases return structured errors.

### Phase 3: Documentation Cleanup (P2)

1. Fix duplicated Section 2 in GRAPHIFY_DEEP_DIVE.md
2. Update test counts to match actual test files
3. Update GRAPHIFY_CONTRACT.md to match actual code behavior
4. Add contextUsage field documentation
5. Add confidence-strategy.ts reference
6. Add query budget / output size limits documentation
7. Add graph findings attack surface analysis

**Verification:** Manual review — all docs match current code, no aspirational content without "future" qualifier.

### Phase 4: Minor Improvements (P3)

1. Document capability cache lifetime
2. Explain dual capability indicators
3. Add graphifyVersion wiring to preamble
4. Clarify confidence mapping is manual, not automatic
5. Add trade-off analysis to industry comparisons
6. Add AgentOS responsibility boundary analysis

**Verification:** Manual review — all minor items addressed.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/infrastructure/graphify-client.ts` | Add error visibility, circuit breaker, query caching, provenance |
| `src/infrastructure/graphify-parser.ts` | Extract inferredConfidence, populate dead fields |
| `src/tools/attend-tool.ts` | Wire error visibility to agent |
| `src/schema.ts` | Add circuit breaker state, provenance fields |
| `src/hooks/context-hook.ts` | Fix capability caching |
| `src/rendering/preamble-builder.ts` | Wire graphifyVersion |
| `docs/GRAPHIFY_DEEP_DIVE.md` | Fix duplication, update test counts, add missing docs |
| `docs/GRAPHIFY_BEST_PRACTICES_AUDIT.md` | Add missing gaps, fix priority ordering |
| `docs/GRAPHIFY_CONTRACT.md` | Update to match actual code behavior |

---

## Success Criteria

- [ ] All P0 items fixed and tested
- [ ] All P1 items fixed and tested
- [ ] All docs match current code behavior (no aspirational content without qualifier)
- [ ] All 4 capability levels work correctly in preamble
- [ ] Confidence values flow through from Graphify CLI to noesis_believe
- [ ] Error cases return structured errors, not silent []
- [ ] Circuit breaker prevents cascading failures
- [ ] Query caching reduces repeated query latency
- [ ] Provenance tracking enables audit trail
