# Graphify Integration — Best Practices Audit

> **Version:** 0.1.0
> **Date:** 2026-06-16
> **Status:** Analysis complete

## Executive Summary

Graphify's integration follows **many** best practices but has **clear gaps** in error resilience, provenance tracking, and production hardening. The core architecture is sound — the gaps are in the details.

| Category | Score | Verdict |
|----------|-------|---------|
| CLI Integration | 8/10 | Strong — Bun.spawn, timeouts, no shell |
| Graceful Degradation | 7/10 | Good — 4 capability levels, but no circuit breaker |
| Confidence Scoring | 6/10 | Adequate — 3 tiers, but no calibration or provenance |
| Error Handling | 5/10 | Weak — silent failures, no retry, no backoff |
| State Management | 7/10 | Good — ephemeral/durable separation, but no checkpointing |
| Observability | 4/10 | Weak — no metrics, no tracing, limited logging |

**Overall: 6.2/10** — Production-ready for v1, but needs hardening for scale.

## Priority 0: Data Pipeline Fixes (Must Fix)

> **These are the foundation — nothing else works until these are fixed.**

### P0-1: Parser drops inferredConfidence — broken confidence pipeline

**Severity:** Critical
**Gap:** The parser (`graphify-parser.ts`) only extracts `query`, `nodes`, `relations`, `confidence`, and `timestamp` from CLI output. It does NOT extract `inferredConfidence`, `community`, `godNodes`, `surprisingConnections`, or `rawOutput`.

**Impact:** All INFERRED findings flatline at 0.70 regardless of actual graph confidence. The tiered confidence table in GRAPHIFY_CONTRACT.md §6 is aspirational, not functional.

**Fix:** Wire the parser to extract all optional fields from Graphify CLI output. Validate against the GraphFinding schema in `src/shared/schema.ts`.

### P0-2: Capability detection caching never refreshes

**Severity:** Critical
**Gap:** The context-hook (`context-hook.ts`) caches `_capability` once per session and never refreshes. If graphify becomes available mid-session (e.g., user installs CLI), the capability level remains DEGRADED until the next session.

**Impact:** Agent can't use graph features even after graphify is installed, until OMP restarts.

**Fix:** Either invalidate the cache when graphify state changes, or re-detect on each turn (acceptable since `detectCapability` is fast — it's just `Bun.which` + `stat`).

---

## 1. CLI Integration — What Graphify Does Right

### ✅ Shell Injection Prevention

```typescript
// GOOD: Bun.spawn with explicit args array
const proc = Bun.spawn(
  ["graphify", "query", question, "--graph", graphPath],
  { cwd: projectRoot, stdout: "pipe", timeout: 30000 }
);
```

**Best Practice (Zylos Research):** "Always use `spawn(..., { shell: false })` and avoid `exec` with user-controlled content. Do not place user content in argv; keep sensitive data in stdin."

**Verdict:** ✅ Graphify follows this correctly. No shell interpretation, args passed as array.

### ✅ Timeout Enforcement

```typescript
// GOOD: Explicit timeout with auto-kill
timeout: 30000,  // 30s for queries
timeout: 120000, // 120s for builds
```

**Best Practice (Bun Docs):** "Set a reasonable timeout to bound runtime, and choose a killSignal appropriate for your use case."

**Verdict:** ✅ Timeouts are set. But see Gap #1 below.

### ✅ No Shell Wrapper

```typescript
// GOOD: Direct binary execution
Bun.which("graphify")  // Check availability
Bun.spawn(["graphify", ...])  // Direct execution
```

**Verdict:** ✅ No `shell: true`, no `exec`, no shell interpretation.

---

## 2. Graceful Degradation — What Graphify Does Right

### ✅ Four Capability Levels

```
FULL    → Everything works
STALE   → Works with confidence penalty
NO_GRAPH → Can't query, can still build
DEGRADED → No graph features at all
```

**Best Practice (Agent Patterns Catalog):** "Graceful Degradation is a pattern for AI agents with multiple optional dependencies. When a single dependency fails, the system downgrades gracefully rather than failing entirely."

**Verdict:** ✅ Excellent design. Four distinct levels with clear behavior differences.

### ✅ User Disclosure

```typescript
// GOOD: Capability level shown in preamble
case "FULL":
  return `[Noesis: FULL — graph-aware, v${graphifyVersion ?? "?"}]`;
case "STALE":
  return `[Noesis: STALE — graph ${hours}h stale, review needed]`;
```

**Best Practice (Geodocs.dev):** "Communicate clearly to users about degraded performance and provide retry or incident IDs when applicable."

**Verdict:** ✅ Agent always knows its capability level.

---

## 3. Confidence Scoring — What Graphify Does Right

### ✅ Three-Tier Confidence Model

```
EXTRACTED → 1.0  (direct observation)
INFERRED  → 0.55-0.95  (inference with explicit confidence)
AMBIGUOUS → 0.55  (low confidence, store but don't trust)
```

**Best Practice (TGDK Survey):** "Confidence scores should be calibrated to a common probabilistic scale to enable meaningful fusion across sources."

**Verdict:** ✅ Clear tiers with semantic meaning. But see Gap #3 below.

### ✅ Stale Penalty

```
EXTRACTED: No penalty (still direct observation)
INFERRED: -0.10 (subtracted, floor 0.55)
AMBIGUOUS: No penalty (already at floor)
```

**Verdict:** ✅ Reasonable approach — stale data gets penalized, fresh data doesn't.

---

## 4. What Graphify Does Wrong — Gaps

### Gap #1: Silent Failures

```typescript
// BAD: Catches all errors, returns empty array
export async function query(
  projectRoot: string,
  question: string,
): Promise<GraphFinding[]> {
  // ...
  try {
    // ... spawn and parse
  } catch {
    return [];  // ← Silent failure
  }
}
```

**Problem:** When a query fails, the agent gets an empty array. It has no idea *why* — timeout? Parse error? CLI crash? Permission denied?

**Best Practice (AWS Well-Architected):** "Implement per-tool error/timeout thresholds, exponential backoff with jitter, and maintain fallback orders in a central tool registry."

**Impact:** Agent might retry the same failing query repeatedly, wasting time.

**Recommendation:**
```typescript
export async function query(
  projectRoot: string,
  question: string,
): Promise<{ findings: GraphFinding[]; error?: string }> {
  // ...
  try {
    // ... spawn and parse
    return { findings: [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { findings: [], error: message };
  }
}
```

---

### Gap #2: No Circuit Breaker

```typescript
// Current: No state tracking
export async function query(...): Promise<GraphFinding[]> {
  // Every call spawns a new process, even if graphify is broken
}
```

**Problem:** If Graphify CLI is broken (e.g., corrupted installation), every query will timeout (30s each). The agent doesn't know to stop trying.

**Best Practice (Geodocs.dev Agent Circuit Breaker Spec):** "Three states—closed (normal flow), open (failing, reject calls), half-open (test recovery). Per-dependency circuit breakers prevent cascading failures."

**Impact:** 5 queries × 30s timeout = 2.5 minutes wasted on a broken tool.

**Recommendation:**
```typescript
const circuitBreaker = {
  failures: 0,
  lastFailure: 0,
  state: 'closed' as 'closed' | 'open' | 'half-open',
  
  record(failure: boolean) {
    if (failure) {
      this.failures++;
      this.lastFailure = Date.now();
      if (this.failures >= 3) this.state = 'open';
    } else {
      this.failures = 0;
      this.state = 'closed';
    }
  },
  
  canTry(): boolean {
    if (this.state === 'closed') return true;
    if (this.state === 'open' && Date.now() - this.lastFailure > 60000) {
      this.state = 'half-open';
      return true;
    }
    return this.state === 'half-open';
  }
};
```

---

### Gap #3: No Confidence Calibration

```typescript
// Current: Raw mapping
EXTRACTED → 1.0
INFERRED  → 0.70 (default)
AMBIGUOUS → 0.55
```

**Problem:** The confidence values from Graphify aren't calibrated to Noesis's belief system. An INFERRED 0.95 might mean something different than a Noesis confidence of 0.95.

**Best Practice (TGDK Survey):** "Calibrate upstream confidence scores to a consistent probabilistic scale before fusion. Use Platt scaling or isotonic regression."

**Impact:** Agent might over-trust or under-trust graph evidence.

**Recommendation:** Add a calibration function:
```typescript
function calibrateConfidence(
  graphConfidence: GraphConfidence,
  explicitScore?: number,
  isStale: boolean = false
): number {
  let base: number;
  
  switch (graphConfidence) {
    case 'EXTRACTED':
      base = 1.0;
      break;
    case 'INFERRED':
      base = explicitScore ?? 0.70;
      // Apply Platt scaling or lookup table
      base = plattScale(base);
      break;
    case 'AMBIGUOUS':
      base = 0.55;
      break;
  }
  
  // Stale penalty
  if (isStale && graphConfidence === 'INFERRED') {
    base = Math.max(0.55, base - 0.10);
  }
  
  return base;
}
```

---

### Gap #4: No Provenance Tracking

```typescript
// Current: Finding has no origin info
GraphFinding = {
  query: string,
  nodes: string[],
  relations: string[],
  confidence: GraphConfidence,
  timestamp: string,
  // ← No graphVersion, no graphMtime, no sourceHash
}
```

**Problem:** When a finding is committed as a belief, there's no way to trace it back to the exact graph state that produced it.

**Best Practice (NIF 2.1):** "Represent confidence as triple metadata alongside provenance information. Maintain provenance/history to support conflict resolution and future enrichment."

**Impact:** Can't audit which graph version produced a belief. Can't detect if a belief is based on stale data.

**Recommendation:**
```typescript
GraphFinding = {
  query: string,
  nodes: string[],
  relations: string[],
  confidence: GraphConfidence,
  inferredConfidence?: number,
  timestamp: string,
  // NEW: Provenance
  graphVersion?: string,     // Graphify CLI version
  graphMtime?: string,       // Graph file modification time
  sourceHash?: string,       // Hash of graph.json content
}
```

---

### Gap #5: No Retry Logic

```typescript
// Current: Single attempt, fail immediately
try {
  const proc = Bun.spawn(["graphify", "query", ...], { timeout: 30000 });
  // ...
} catch {
  return [];  // ← No retry
}
```

**Problem:** Transient failures (network, disk I/O, process scheduling) cause permanent failure.

**Best Practice (Harness Engineering):** "Implement retry logic with exponential backoff for transient failures. Distinguish between retryable (timeout, network) and non-retryable (invalid args, permission) errors."

**Impact:** A single flaky query loses all findings.

**Recommendation:**
```typescript
async function queryWithRetry(
  projectRoot: string,
  question: string,
  maxRetries: number = 2,
): Promise<GraphFinding[]> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await query(projectRoot, question);
    } catch (err) {
      if (attempt === maxRetries) return [];
      await sleep(1000 * Math.pow(2, attempt)); // Exponential backoff
    }
  }
  return [];
}
```

---

### Gap #6: No Observability

```typescript
// Current: No metrics, no tracing
export async function query(...): Promise<GraphFinding[]> {
  const proc = Bun.spawn(["graphify", "query", ...]);
  // ← No timing, no logging, no metrics
}
```

**Problem:** Can't diagnose performance issues, can't track success rates, can't detect degradation trends.

**Best Practice (AWS Well-Architected):** "Enable observability via per-tool metrics and composite alarms. Maintain weekly SLA reports with tool owners."

**Impact:** Can't tell if Graphify is slow, failing, or degrading over time.

**Recommendation:**
```typescript
const metrics = {
  queries: 0,
  successes: 0,
  failures: 0,
  timeouts: 0,
  avgDuration: 0,
};

export async function query(...): Promise<GraphFinding[]> {
  const start = Date.now();
  metrics.queries++;
  
  try {
    const findings = await queryInternal(...);
    metrics.successes++;
    metrics.avgDuration = (metrics.avgDuration + (Date.now() - start)) / 2;
    return findings;
  } catch (err) {
    metrics.failures++;
    if (isTimeout(err)) metrics.timeouts++;
    throw err;
  }
}
```

---

### Gap #7: No Graph Update Strategy

```typescript
// Current: Manual only
// Agent must call `graphify . --update` manually
```

**Problem:** Graph goes stale after 24h. Agent must know to update it. No automatic refresh.

**Best Practice (CodeIntelligently):** "Progressively integrate static, runtime, and human data. Use change-coupling to uncover hidden dependencies."

**Impact:** Agent might work with stale graph for days without realizing it.

**Recommendation:** Add automatic update on STALE detection:
```typescript
export async function query(
  projectRoot: string,
  question: string,
): Promise<GraphFinding[]> {
  const capability = await detectCapability(projectRoot);
  
  if (capability === 'STALE') {
    // Auto-update in background
    runGraphifyBuild(projectRoot).catch(() => {}); // Best-effort
  }
  
  if (capability === 'NO_GRAPH') {
    // Try to build
    const build = await runGraphifyBuild(projectRoot);
    if (!build.success) return [];
  }
  
  // ... proceed with query
}
```

---

### Gap #8: No Query Deduplication Across Turns

```typescript
// Current: Each noesis_attend call re-queries
// Agent calls noesis_attend(graphQueries: ["What imports auth?"])
// Next turn: agent calls noesis_attend(graphQueries: ["What imports auth?"])
// → Same query runs twice
```

**Problem:** Wastes time on repeated queries. No caching.

**Best Practice (Redis Agent Memory):** "Use short-term cache for working memory. Deduplicate near-identical memories at write time."

**Impact:** 2x latency for repeated queries.

**Recommendation:**
```typescript
const queryCache = new Map<string, { findings: GraphFinding[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function query(
  projectRoot: string,
  question: string,
): Promise<GraphFinding[]> {
  const cacheKey = `${projectRoot}:${question}`;
  const cached = queryCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.findings;
  }
  
  const findings = await queryInternal(projectRoot, question);
  queryCache.set(cacheKey, { findings, timestamp: Date.now() });
  return findings;
}
```

---

## 5. Comparison to Industry Standards

### vs. GitNexus (KuzuDB-based)

| Feature | Graphify | GitNexus |
|---------|----------|----------|
| Storage | JSON file | KuzuDB (graph DB) |
| Query language | Natural language | Cypher |
| Confidence | 3 tiers | Numeric 0.0-1.0 |
| Provenance | None | Full traceability |
| Incremental | Manual | Automatic |
| Community detection | Basic | Leiden algorithm |

**Verdict:** Graphify is simpler but less capable. Fine for v1.

### vs. CodeGraph (Neo4j-based)

| Feature | Graphify | CodeGraph |
|---------|----------|-----------|
| Edge types | Generic | 30+ typed edges |
| Confidence | 3 tiers | Numeric + labels |
| AST analysis | No | Full AST |
| Query interface | CLI | Cypher + API |
| Provenance | None | Full |

**Verdict:** Graphify is lighter. Good for agent integration.

### vs. AgentOS CLI Bridge

| Feature | Graphify | AgentOS |
|---------|----------|---------|
| Error classification | None | Per-error codes |
| Retry logic | None | Built-in |
| Circuit breaker | None | Per-tool |
| Metrics | None | Full observability |
| Streaming | No | NDJSON |

**Verdict:** AgentOS is production-hardened. Graphify needs similar patterns.

---

## 6. Prioritized Recommendations

### Priority 0: Fix Data Pipeline (Must Fix)

**Why:** Without these fixes, no other graph feature works correctly. The parser drops confidence data, and capability detection can't recover mid-session.

**Fix:** Wire parser to extract all GraphFinding fields. Add cache invalidation to capability detection.

### Priority 1: Error Visibility (Must Fix)

**Why:** Silent failures make debugging impossible.

**Fix:** Return error information alongside findings:
```typescript
type QueryResult = {
  findings: GraphFinding[];
  error?: string;
  duration: number;
};
```

### Priority 2: Circuit Breaker (Should Fix)

**Why:** Prevents wasting 30s per query when Graphify is broken.

**Fix:** Add per-session circuit breaker with 3-failure threshold.

### Priority 3: Retry with Backoff (Should Fix)

**Why:** Transient failures shouldn't cause permanent loss.

**Fix:** 2 retries with exponential backoff (1s, 2s).

### Priority 4: Query Caching (Nice to Have)

**Why:** Repeated queries waste time.

**Fix:** 5-minute TTL cache keyed by projectRoot + question.

### Priority 5: Provenance Tracking (Nice to Have)

**Why:** Enables audit trail and stale detection.

**Fix:** Add graphVersion, graphMtime, sourceHash to GraphFinding.

### Priority 6: Metrics Collection (Nice to Have)

**Why:** Enables performance monitoring and SLA tracking.

**Fix:** Add counters for queries, successes, failures, timeouts, avgDuration.

---

## 7. What's Already Best-in-Class

1. **Shell injection prevention** — Bun.spawn with args array, no shell
2. **Capability levels** — Four distinct degradation states
3. **User disclosure** — Agent always knows its capability
4. **Ephemeral/durable separation** — Graph findings ≠ beliefs
5. **Confidence tiers** — Clear semantic meaning
6. **Stale penalty** — Reasonable approach
7. **Budget enforcement** — Preamble section dropping
8. **Deduplication** — Query-based dedup in attention domain

---

## 8. Conclusion

Graphify's integration is **architecturally sound** but **operationally immature**. The core data flow, confidence model, and degradation patterns are well-designed. The gaps are in production hardening: error visibility, retry logic, circuit breaking, and observability.

**Key takeaway from reading the Graphify repo:** Noesis uses the CLI (`graphify query`) for all graph queries. Graphify's BFS/DFS traversal and community detection are the primary value — the CLI integration is the correct surface for automated preamble evidence.

**Bottom line:** Graphify follows ~60% of best practices. The missing 40% is mostly in error resilience, observability, and production hardening.
---

## 9. What I Learned from Reading the Graphify Repository

### 9.1 Graphify Is Much More Than a CLI

Graphify is a **comprehensive knowledge graph system** with:
- **36+ tree-sitter grammars** for code extraction (Python, TypeScript, Go, Rust, Java, C++, etc.)
- **LLM-based semantic extraction** for docs, PDFs, images, videos
- **Community detection** via Leiden algorithm
- **Multiple LLM backends** (Ollama, OpenAI, Anthropic, Gemini, Bedrock, Azure)
- **Git hooks** for auto-rebuild on commit
- **Query logging** for analytics
- **Cross-project global graphs** (`graphify global`)

### 9.2 The Query Mechanism

Graphify's query system uses **BFS/DFS traversal** on a NetworkX graph:

```python
def _tool_query_graph(arguments):
    question = arguments["question"]
    mode = arguments.get("mode", "bfs")  # bfs or dfs
    depth = min(int(arguments.get("depth", 3)), 6)
    budget = int(arguments.get("token_budget", 2000))
    
    # Score nodes by keyword matching
    terms = [t.lower() for t in question.split() if len(t) > 2]
    scored = _score_nodes(G, terms)
    start_nodes = [nid for _, nid in scored[:3]]
    
    # Traverse from top-scored nodes
    if mode == "dfs":
        nodes, edges = _dfs(G, start_nodes, depth)
    else:
        nodes, edges = _bfs(G, start_nodes, depth)
    
    # Render as text within token budget
    return _subgraph_to_text(G, nodes, edges, budget)
```

**Key insight:** Graphify doesn't use SQL or Cypher — it uses NetworkX graph algorithms directly. This means:
- Queries are fast (in-memory graph traversal)
- No database dependency
- But limited to graph algorithms (no complex joins)

### 9.4 Confidence Scoring in Graphify

From `ARCHITECTURE.md`:

```markdown
| Label | Meaning |
|-------|---------|
| `EXTRACTED` | Relationship is explicitly stated in the source (e.g., an import statement, a direct call) |
| `INFERRED` | Relationship is a reasonable deduction (e.g., call-graph second pass, co-occurrence in context) |
| `AMBIGUOUS` | Relationship is uncertain; flagged for human review in GRAPH_REPORT.md |
```

**How EXTRACTED works:**
- Direct AST observation (import statements, function calls, class inheritance)
- No LLM involved — pure tree-sitter parsing
- Highest confidence because it's deterministic

**How INFERRED works:**
- Second-pass call graph analysis
- Co-occurrence in context
- LLM-based semantic extraction for non-code files
- Lower confidence because it's probabilistic

**How AMBIGUOUS works:**
- Uncertain relationships flagged for human review
- Lowest confidence — store but don't trust

### 9.5 Graph Schema

From `ARCHITECTURE.md`:

```json
{
  "nodes": [
    {"id": "unique_string", "label": "human name", "source_file": "path", "source_location": "L42"}
  ],
  "edges": [
    {"source": "id_a", "target": "id_b", "relation": "calls|imports|uses|...", "confidence": "EXTRACTED|INFERRED|AMBIGUOUS"}
  ]
}
```

**Node properties:**
- `id` — unique identifier
- `label` — human-readable name
- `source_file` — originating file path
- `source_location` — line number or range
- `community` — community ID (from Leiden algorithm)
- `file_type` — file extension

**Edge properties:**
- `source` — source node ID
- `target` — target node ID
- `relation` — relationship type (calls, imports, uses, extends, etc.)
- `confidence` — EXTRACTED | INFERRED | AMBIGUOUS

### 9.6 What Noesis Gets Right vs. Wrong

#### Gets Right ✅

1. **Confidence mapping** — EXTRACTED→1.0, INFERRED→0.70, AMBIGUOUS→0.55 is reasonable
2. **Stale penalty** — -0.10 for INFERRED when graph is stale
3. **Ephemeral findings** — Graph evidence is temporary, beliefs are durable
4. **Capability detection** — FULL/STALE/NO_GRAPH/DEGRADED
5. **Shell injection prevention** — Bun.spawn with args array

#### Gets Wrong ❌

1. **Subprocess overhead** — Each query spawns a new process (30s timeout)
2. **Limited query tools** — Only `query`, not `get_node`, `get_neighbors`, `shortest_path`, `god_nodes`
3. **No incremental updates** — Agent must manually run `graphify . --update`
4. **No query caching** — Same query re-run every turn
5. **No provenance tracking** — Can't trace belief → graph version

### 9.7 Recommended Improvements

**Key improvements for future versions:**
1. Add query caching (5min TTL)
2. Add provenance tracking (graphVersion, graphMtime)
3. Add circuit breaker (3-failure threshold)
4. Add retry with backoff (2 retries, exponential)
5. Add metrics (queries, successes, failures, avgDuration)

---

## 10. OMP Graphify Lifecycle Management

Noesis manages graph freshness automatically through OMP lifecycle hooks:

| Phase | Action |
|-------|--------|
|**Detection**|OMP checks `Bun.which("graphify")` + `graphify-out/graph.json`|
|**Freshness**|Graph >24h old → STALE; no graph → NO_GRAPH; no CLI → DEGRADED|
|**Auto-update**|`session_start` + `turn_end` hooks trigger background `--no-cluster --no-viz` updates|
