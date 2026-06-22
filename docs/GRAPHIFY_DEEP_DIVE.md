---

# Graphify in omp-noesis — Complete Reference

> **Version:** 1.0.0
> **Date:** 2026-06-16
> **Status:** Current (updated after reading Graphify repo)

## 1. What Graphify Is

Graphify is a **comprehensive knowledge graph system** (not just a CLI tool) that builds a queryable graph of your project — mapping files, imports, dependencies, function calls, class hierarchies, and community clusters. It produces `graphify-out/graph.json`, a structured representation of your codebase that Noesis queries for codebase-aware reasoning.

**Key capabilities from the repo:**
- **36+ tree-sitter grammars** for code extraction (Python, TypeScript, Go, Rust, Java, C++, etc.)
- **LLM-based semantic extraction** for docs, PDFs, images, videos
- **Community detection** via Leiden algorithm
- **Multiple LLM backends** (Ollama, OpenAI, Anthropic, Gemini, Bedrock, Azure)
- **Incremental updates** (`--update` flag)
- **Git hooks** for auto-rebuild on commit
- **Query logging** for analytics
- **Cross-project global graphs** (`graphify global`)

**Graphify is NOT part of Noesis.** It's a separate tool (`pip install graphifyy`) that Noesis wraps and queries. Noesis never modifies, extends, or replaces Graphify — it only consumes its output.

### Key Distinction

- **Graphify** = static analysis tool that builds a knowledge graph from source code
- **Noesis** = cognitive substrate that queries the graph for evidence, then reasons about it

Noesis treats Graphify as an **oracle** — it asks questions and gets answers. It never builds, modifies, or manages the graph itself (except during initial setup via `/noesis:init`).

## 2. Why Graphify Exists in Noesis

Noesis needs **grounded evidence** to avoid hallucination. Without Graphify, the agent's beliefs are based on:
- What the user tells it
- What it observes in tool outputs
- What it infers from context

With Graphify, the agent can also say:
- "I checked the dependency graph — `auth.ts` imports from `token.ts` and `session.ts`"
- "The community detection shows these 3 files form a tight cluster"
- "There's a surprising connection between `config.ts` and `deploy.ts`"

This turns Noesis from a "trust me" system into an "I verified" system.
- **Noesis** = cognitive substrate that queries the graph for evidence, then reasons about it

Noesis treats Graphify as an **oracle** — it asks questions and gets answers. It never builds, modifies, or manages the graph itself (except during initial setup via `/noesis:init`).


## 3. Architecture: The Complete Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                       AGENT TURN (CLI-Only)                        │
│                                                                     │
│  1. Agent calls noesis_attend(graphQueries: ["What imports auth?"]) │
│     │                                                                │
│  2. attend-tool.ts iterates queries, calls graphifyQuery()          │
│     │                                                                │
│  3. graphify-client.ts queries via CLI:                             │
│     └── graphify query "..." --graph graphify-out/graph.json        │
│     └── Parses JSON output → structured GraphFinding[]              │
│     │                                                                │
│  4. graphify-parser.ts parses JSON → GraphFinding[]                 │
│     │                                                                │
│  5. attention-domain.ts: storeGraphFindings()                       │
│     - Deduplicates by query string                                  │
│     - Appends to state.attention.graphFindings                      │
│     │                                                                │
│  6. context-hook.ts (next turn):                                    │
│     - detectCapability() → FULL/STALE/NO_GRAPH/DEGRADED            │
│     - buildPreamble() → buildGraphEvidence() shows top 2 findings   │
│     - Agent sees: "Graph evidence (2): What imports auth? ..."      │
│     │                                                                │
│  7. Agent calls noesis_believe_fact(source="graph")                  │
│     - Ephemeral finding becomes durable belief                      │
│     - Confidence from graph confidence mapping                      │
│     │                                                                │
│  8. turn-end-hook.ts: fullCleanup()                                 │
│     - evictOverCap() trims graphFindings to CAPS.graphQueries (5)  │
│     - Findings NOT in survivor set → lost after compaction          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. File-by-File Breakdown

### 4.1 Infrastructure Layer

#### `src/infrastructure/graphify-client.ts` — CLI Client

**Purpose:** Single entry point for all Graphify queries. Uses CLI via `Bun.spawn` for all queries.

**Functions:**

| Function | What It Does | Timeout | Error Handling |
|----------|-------------|---------|----------------|
 | `detectCapability(projectRoot)` | Checks CLI availability + graph freshness → capability level | None (fast checks) | Returns "DEGRADED" if both unavailable, "STALE" if stat fails |
 | `query(projectRoot, question)` | CLI call `graphify query` via Bun.spawn | 30s | Returns `[]` on any error |
| `build(projectRoot)` | Delegates to `runGraphifyBuild()` | 120s | Returns `{ success: false, output: errorMessage }` |

**CLI-Only Query Execution:**
```
1. validateGraphPath() → null? → return []
2. Bun.spawn(["graphify", "query", question, "--graph", graphPath])
   - cwd: projectRoot, stdout: "pipe", timeout: 30000ms
3. Read stdout as text
4. parseQueryOutput(raw) → GraphFinding[]
5. Any error → return []
```

**Capability Detection Logic:**
```
1. Bun.which("graphify") → null? → DEGRADED
2. validateGraphPath(projectRoot) → null? → NO_GRAPH
3. stat(graphPath).mtimeMs → age > 24h? → STALE : FULL
4. stat() throws → STALE (safe fallback)
```
**Critical Design Decisions:**
- CLI is the only query path — always uses Bun.spawn, no MCP overhead
- Never uses `exec` or shell — always `Bun.spawn` (no injection risk)
- Returns empty array on failure, never throws (caller never crashes)
- 30s timeout prevents hung queries on large codebases

### Autonomous Graph Lifecycle (v0.3+)

Noesis manages graph freshness automatically through OMP lifecycle hooks:

1. **session_start:** On session load, checks graph health. If stale/missing,
   kicks off a background build/update during initialization.
2. **noesis_attend(ensureFresh=true):** Agent can request a graph refresh
   before querying. Uses `graphify . --update --no-cluster --no-viz`.
3. **turn_end background:** After cleanup, if graph is stale and rate limit
   allows, triggers a detached background update.
4. **session_shutdown:** Fire-and-forget final update so next session starts fresh.

**Rate limiting:** Max 1 update per 15 minutes (configurable via
`.omp/config.yml` as `noesis.graphify.maxUpdateInterval`).

**Size safeguard:** Updates skip graphs larger than 50MB.

---

#### `src/infrastructure/graphify-parser.ts` — Output Parser

**Purpose:** Converts raw JSON stdout from `graphify query` into typed `GraphFinding` objects.

**Two Supported Output Shapes:**

```json
// Shape 1: results array
{ "results": [{ "query": "...", "nodes": [...], "confidence": "EXTRACTED" }] }

// Shape 2: findings under query context
{ "query": "...", "findings": [{ "nodes": [...], "confidence": "INFERRED" }] }
```

**Parsing Logic:**
```
1. JSON.parse(raw) → if fails, return []
2. isRecord(parsed) → if false, return []
3. Check for results[] or findings[] → extract items
4. For each item:
   - query: string (fallback to top-level query or "")
   - nodes: string[] (filter non-strings)
   - relations: extractRelations() → edges | links | relations
   - confidence: toGraphConfidence() → EXTRACTED | INFERRED | AMBIGUOUS
   - timestamp: now() (ISO datetime)
5. Return GraphFinding[]
```

**Relation Extraction Priority:**
1. `edges` array → serialize as `"source→target"` strings
2. `links` array → same serialization (legacy fallback)
3. `relations` array → direct string list
4. None present → empty array

**Confidence Normalization:**
- Accepts any case ("extracted", "EXTRACTED", "Extracted")
- Unknown values → "AMBIGUOUS" (safe fallback)
- Null/missing → "AMBIGUOUS"

**Edge Cases Handled:**
- Invalid JSON → `[]`
- Empty string → `[]`
- BOM character prefix → `[]` (JSON.parse rejects BOM)
- Extra whitespace → trimmed by JSON.parse
- Null fields → defaults (empty strings/arrays, AMBIGUOUS)
- Mixed valid/invalid items → valid items only
- Object edges `{source, target}` → serialized to strings

---

#### `src/infrastructure/graphify-setup.ts` — CLI Bootstrap

**Purpose:** CLI detection, skill file installation, and initial graph build.

**Functions:**

| Function | What It Does | Throws? |
|----------|-------------|---------|
| `checkGraphifyCLI()` | Checks if `graphify` binary exists via `Bun.which`, extracts version | No |
| `installGraphifySkill(projectRoot)` | Downloads SKILL.md from GitHub, writes to `.omp/skills/graphify/` | Yes (on fetch failure) |
| `runGraphifyBuild(projectRoot)` | Runs `graphify . --no-viz` (120s timeout) | No |

**Skill Installation:**
```
1. Create .omp/skills/graphify/ directory if missing
2. fetch("https://raw.githubusercontent.com/safishamsi/graphify/HEAD/graphify/skill.md")
3. Check response.ok → if false, throw
4. Write content to .omp/skills/graphify/SKILL.md
5. Return absolute path
```

**Build Invocation:**
```
1. Bun.spawn(["graphify", ".", "--no-viz"])
   - cwd: projectRoot
   - stdout: "pipe"
   - stderr: "pipe"
   - timeout: 120000ms (2 minutes)
2. Read stdout as text
3. Wait for exit code
4. Return { success: exitCode === 0, output }
```

---

### 4.2 Tool Layer

#### `src/tools/attend-tool.ts` — Agent Entry Point

**Purpose:** The **only** way agents invoke Graphify. Wraps graph queries with focus/file management.

**Parameters:**
```typescript
{
  focus: string,              // Required, 1-200 chars
  files?: string[],           // Optional, max 10
  graphQueries?: string[],    // Optional, max 5
  priority: "low" | "normal" | "high" | "critical"  // Default: "normal"
}
```

**Execution Flow:**
```
1. For each graphQuery:
   a. graphifyQuery(projectRoot, question)
   b. Push results to allFindings[]
   c. Increment findingsCount
   d. On error: skip (non-fatal)
2. Single atomic mutation:
   a. setFocus(state, focus, priority)
   b. setFiles(state, files)
   c. setGraphQueries(state, graphQueries)
   d. storeGraphFindings(state, allFindings)
3. Return content with focus info + findings count
```

**Critical Design Decisions:**
- Queries run sequentially (not parallel) — avoids subprocess explosion
- Each query failure is non-fatal — other queries still run
- Single atomic mutation — focus, files, queries, and findings update together
- Returns structured details for programmatic callers

---

### 4.3 Domain Layer

#### `src/domains/attention/attention-domain.ts` — State Mutator

**Graph Finding Functions:**

| Function | Behavior |
|----------|----------|
| `storeGraphFindings(state, findings)` | Appends findings, deduplicates by query string |
| `clearGraphFindings(state)` | Empties the findings array |

**Deduplication Logic:**
```
1. Build Set of existing query strings
2. For each new finding:
   - If query NOT in Set → push to array, add to Set
   - If query IN Set → skip (duplicate)
3. Update updatedAt timestamp
```

**Important:** Findings are **ephemeral** — stored in attention, rendered in preamble, but NOT in survivor set. They're lost after compaction unless committed via `noesis_believe_fact`.


#### `src/domains/belief/confidence-strategy.ts` — Confidence Mapping

**Purpose:** Provides calibration functions for mapping graph confidence to belief confidence. Contains the stale penalty logic and tiered confidence mapping used by the belief domain.

---

### 4.4 Rendering Layer

#### `src/rendering/preamble-builder.ts` — Graph Evidence Section

**`buildGraphEvidence(state)` — Section 9 of 11:**
```
1. If graphFindings.length === 0 → return ""
2. Sort findings by timestamp (newest first)
3. Take top 2
4. Render:
   Graph evidence (N):
     - query1
     - query2
```

**Budget Enforcement:**
- Section 9 is **not protected** — dropped first if preamble exceeds 2000 tokens
- Drop order: bottom-up (section 10, then 9, then 8, etc.)
- Protected sections (1-3, 11) never dropped

**Capability Block (Section 1):**
```
FULL   → "[Noesis: FULL — graph-aware, v{version}]"
STALE  → "[Noesis: STALE — graph {hours}h stale, review needed]"
NO_GRAPH → "[Noesis: NO_GRAPH — graph not built]"
DEGRADED → "[Noesis: DEGRADED — limited operation]"
```

### Dual Capability Indicators

There are two independent capability indicators:

1. **before_agent_start footer** (Section 3.7a): A lightweight status line in the system prompt footer. Shows `[Graphify: FULL]`, `[Graphify: STALE]`, etc. Provides a quick status check at the start of each session.

2. **Context-hook preamble Section 1**: Richer detail rendered live every turn. Shows `[Noesis: FULL — graph-aware, v?]` with version and freshness information. This is the authoritative capability indicator.

The footer is session-level; the preamble is turn-level. If they disagree, trust the preamble.


---

#### `src/rendering/survivor-builder.ts` — Compaction Survival

**Graph findings are NOT in the survivor set.** The survivor includes:
- `<attention>` — focus, priority, files (NOT graphFindings)
- `<beliefs>` — active facts with confidence ≥ 0.75
- `<workflow>` — goal, status, pending/active steps
- `<learning>` — top 3 entries by recency
- `<pointer>` — `.omp/noesis/state.json`

**Why?** Graph findings are ephemeral evidence, not durable knowledge. They should be committed as beliefs before compaction.

---

#### `src/application/use-cases/end-turn-cleanup.ts` — Capacity Enforcement

Graph-finding eviction is now part of the end-turn cleanup orchestrated by `EndTurnCleanupUseCase`, invoked from `src/hooks/turn-end-hook.ts`:
```
If graphFindings.length > CAPS.graphQueries (5):
  1. Sort by timestamp descending (newest first)
  2. Keep first 5
  3. Discard rest
```

The `EndTurnCleanupUseCase` also handles stale-eviction across belief, inference, learning, and capacity-caps on workflow steps, actions, and learning entries. See `src/application/use-cases/end-turn-cleanup.ts` and `src/domains/learning/eviction-strategy.ts`.

**Note:** The original `src/rendering/state-cleanup.ts` was deleted. Rendering is now purely for preamble/survivor/focus construction.
---

### 4.5 Hook Layer

#### `src/hooks/context-hook.ts` — Capability Detection

**Module-level cache:**
```typescript
let _capability: CapabilityLevel | null = null;

// In handler:
if (_capability === null) {
  _capability = await detectCapability(runtime.projectRoot);
}
```

**Why cache?** Capability detection checks CLI + graph file + mtime. Caching once per session avoids repeated filesystem calls.

**Cache Lifetime:** The cached capability level persists for the entire OMP session. If the graph is built or updated mid-session, the capability level will not reflect the change until the next agent restart (OMP session boundary). This is by design — capability detection is fast but session-level caching avoids repeated filesystem calls.


---

#### `src/hooks/turn-end-hook.ts` — Cleanup

Calls `fullCleanup(state)` which includes `evictOverCap()` — trims graphFindings to max 5.

---

#### `src/hooks/append-system.ts` — System Prompt

Contains `<graphify>` section with confidence mapping rules:
```
EXTRACTED → 1.0 (believe after verify)
INFERRED → 0.55–0.95 (default 0.70, verify first)
AMBIGUOUS → 0.55 (store, low-confidence)
Stale graph: -0.10 from INFERRED only (additive, floor 0.55)
```

---

### 4.6 Command Layer

#### `src/commands/init-command.ts` — Bootstrap

**Graphify Setup Steps:**
```
1. Check skipGraphify flag → if true, return "initialized-degraded-no-graphify"
2. checkGraphifyCLI() → if not installed, return "initialized-degraded-no-cli"
3. installGraphifySkill(projectRoot) → writes .omp/skills/graphify/SKILL.md
4. Send LLM-visible message about skill availability (deliverAs: "steer")
5. If buildGraph:
   a. runGraphifyBuild(projectRoot) → 120s timeout
   b. Report success/failure via sendMessage()
6. Return "initialized-full"
```

---

### 4.7 Shared Utilities

#### `src/shared/paths.ts` — Graph Path Validation

```typescript
export function validateGraphPath(projectRoot: string): string | null {
  const defaultPath = join(projectRoot, "graphify-out", "graph.json");
  if (existsSync(defaultPath)) return defaultPath;
  return null;
}
```

**Hardcoded path** — always expects `graphify-out/graph.json` at project root. No configuration.

---

### 4.8 Schema

#### `src/shared/schema.ts` — Type Definitions

```typescript
GraphConfidence = "EXTRACTED" | "INFERRED" | "AMBIGUOUS"

CapabilityLevel = "FULL" | "STALE" | "NO_GRAPH" | "DEGRADED"

GraphFinding = {
  query: string,
  nodes: string[],
  relations: string[],
  confidence: GraphConfidence,
  inferredConfidence?: number,  // 0.55-0.95 for INFERRED
  community?: string,
  godNodes?: string[],
  surprisingConnections?: string[],
  rawOutput?: string,
  timestamp: string,  // ISO datetime
}

CAPS.graphQueries = 5  // Max findings stored
CAPS.files = 10        // Max file references
```

**contextUsage** (number): Internal bookkeeping field tracking how much of the preamble token budget has been consumed by attention content. Initialized to 0, updated by the rendering layer.


---

## 5. Confidence Translation Model

### Source → Noesis Confidence

| Graphify Source | Noesis Confidence | Reasoning |
|----------------|-------------------|-----------|
| `EXTRACTED` | 1.0 | Direct observation from code — highest trust |
| `INFERRED 0.95` | 0.95 | High-confidence inference |
| `INFERRED 0.85` | 0.85 | Medium-confidence inference |
| `INFERRED 0.75` | 0.75 | Lower-confidence inference |
| `INFERRED (none)` | 0.70 | Default when no explicit confidence |
| `AMBIGUOUS` | 0.55 | Low confidence — store but don't trust |

### Stale Penalty

If graph is >24h old (STALE mode):
- EXTRACTED: No penalty (still direct observation)
- INFERRED: -0.10 (subtracted from confidence, floor 0.55)
- AMBIGUOUS: No penalty (already at floor)

### Belief Source Mapping

When agent calls `noesis_believe_fact(source: "graph")`:
```
confidence = graphConfidence * stalenessMultiplier
```

The agent decides whether to trust the finding based on the confidence value.

agent must manually apply this formula when calling `noesis_believe_fact(source: "graph")`

---

## 6. Capability Levels — Behavior Matrix

| Level | Condition | Preamble Shows | Queries Work? | Builds Work? |
|-------|-----------|---------------|---------------|--------------|
| **FULL** | CLI installed, graph exists, <24h old | `[Noesis: FULL — graph-aware]` | Yes | Yes |
| **STALE** | CLI installed, graph exists, >24h old | `[Noesis: STALE — graph Xh stale]` | Yes (with penalty) | Yes |
| **NO_GRAPH** | CLI installed, no graph.json | `[Noesis: NO_GRAPH — graph not built]` | No (returns []) | Yes |
| **DEGRADED** | CLI not installed | `[Noesis: DEGRADED — limited operation]` | No (returns []) | No |

---

## 7. Error Handling — Complete Matrix

| Scenario | Where | Behavior | Recovery |
|----------|-------|----------|----------|
| CLI not installed | `detectCapability()` | Returns DEGRADED | Install graphify |
| Graph file missing | `validateGraphPath()` | Returns null → NO_GRAPH | Run `graphify .` |
| Graph >24h old | `detectCapability()` | Returns STALE | Run `graphify . --update` |
| Query timeout (30s) | `query()` | Returns `[]` | Retry or skip |
| Query exit code ≠0 | `query()` | Returns `[]` | Check graph exists |
| Invalid JSON output | `parseQueryOutput()` | Returns `[]` | Check graphify version |
| BOM in output | `parseQueryOutput()` | Returns `[]` | Known limitation |
| Null fields in finding | `parseQueryOutput()` | Defaults applied | N/A |
| Skill fetch fails | `installGraphifySkill()` | Throws | Check network/URL |
| Build timeout (120s) | `runGraphifyBuild()` | Returns `{ success: false }` | Retry or skip |
| Build exit code ≠0 | `runGraphifyBuild()` | Returns `{ success: false, output }` | Check output |
| State file corrupt | `stateManager.read()` | Rebuilds from EMPTY_STATE | Automatic |

---

## 8. Test Coverage

### Unit Tests

| File | Tests | Coverage |
|------|-------|----------|
| `tests/unit/infrastructure/graphify-parser-edge.test.ts` | 16 | Confidence fallback, object edges, findings shape, degenerate inputs |
| `tests/unit/infrastructure/graphify-setup.test.ts` | 5 | Skill download, directory creation, fetch errors, build invocation |
| `tests/unit/domains/attention.test.ts` | 8 | storeGraphFindings dedup, clearGraphFindings, cap enforcement |

### Integration Tests

| File | Tests | Coverage |
|------|-------|----------|
| `tests/integration/graphify.test.ts` | 10 | Parser (6), client (3), setup (4), CLI detection (1) |
| `tests/integration/tools.test.ts` | 1 | attend-tool graph query execution |
| `tests/integration/init-command.test.ts` | 5 | Graphify degradation paths, skill message, return values |

### Edge Cases Tested

- Invalid JSON, empty strings, BOM characters
- Null/missing fields in findings
- Mixed valid/invalid items in results array
- Object edges `{source, target}` vs string edges
- Two output shapes (results[] vs findings[])
- Duplicate query deduplication
- Empty findings array
- CLI not installed
- Graph file missing
- Build timeout
- Fetch failure for skill download

---

## 9. Design Rules (from GRAPHIFY_CONTRACT.md)

1. **Noesis queries Graphify; never builds, replaces, or wraps it as a user tool**
2. **Graph evidence is surfaced as candidates, not auto-committed** — agent must call `noesis_believe_fact`
3. **CLI-only** — all graph queries use `Bun.spawn(["graphify", "query", ...])`
4. **Confidence is always evidence-grounded for graph sources**
5. **Stale graphs get confidence penalties, not query refusals**
6. **DEGRADED mode is graceful: rest of noesis still works**
7. **All Graphify commands use Bun.spawn, never shell**

---

## 10. Commands Used vs. Not Used

### Used

```bash
graphify --version           # CLI detection
graphify .                   # First-time build (via init)
graphify . --no-viz          # First-time build without visualization
graphify . --update          # Incremental update (manual)
graphify query "..." --graph graphify-out/graph.json   # CLI fallback query
```

### Never Used

```bash
graphify . --obsidian        # Obsidian export handled separately
graphify serve               # Not used — OMP handles graph lifecycle
graphify global              # Cross-project is future
graphify prs                 # Out of scope
graphify watch               # OMP handles file watching
```

---

## 11. Current Limitations

### 1. Manual Trigger Only

Agent must explicitly call `noesis_attend(graphQueries: [...])`. There is no automatic discovery — Noesis doesn't proactively query the graph based on context.

**Impact:** Agent might miss relevant graph evidence if it doesn't think to query.

### 2. Ephemeral Findings

Graph evidence is stored in `attention.graphFindings`, rendered in preamble, but:
- NOT in survivor set (lost after compaction)
- Cleared if not committed via `noesis_believe_fact`
- Evicted to max 5 by `turn-end-hook`

**Impact:** Agent must commit findings as beliefs before they're lost.

### 3. CLI Overhead

Every graph query spawns a subprocess (`Bun.spawn`) which has inherent overhead:
- 30s timeout per query
- Sequential execution (not parallel)
- Cold start for each invocation

**Impact:** Multiple queries on the CLI fallback path still add up.

### 4. 2-Finding Limit

Preamble only shows top 2 most recent findings by timestamp. Older findings are invisible until committed.

**Impact:** Agent might forget about earlier findings.

### 5. No Query History

Each `noesis_attend` call re-queries from scratch. No caching of previous query results.

**Impact:** Repeated queries for the same thing waste time.

### 6. Hardcoded Graph Path

Always expects `graphify-out/graph.json` at project root. No configuration option.

**Impact:** Can't use custom graph locations.

### 7. No Incremental Querying

No mechanism to say "show me what changed since last query" or "query only new files."

**Impact:** Full re-query every time.

### 8. BOM Limitation

JSON.parse rejects BOM-prefixed output. Parser returns `[]` for BOM-prefixed graphify output.

**Impact:** Some Windows-generated files might have BOM.

---

## 12. Future Enhancements (from GRAPHIFY_CONTRACT.md)

> **Note:** All graph queries use CLI via Bun.spawn. Cross-Project Graphs and Real-Time Updates remain future enhancements.



### Cross-Project Graphs

```bash
graphify global
```

Query across multiple projects. Would enable:
- Dependency analysis across repos
- Shared library detection
- Architecture validation

### Real-Time Updates

```bash
graphify watch
```

OMP already handles file watching, but graphify watch could:
- Auto-update graph on file changes
- Reduce staleness
- Enable incremental queries

---

## 13. Relationship to Other Noesis Layers

### Attention Layer

Graph findings live in `state.attention.graphFindings`. They're:
- Set by `noesis_attend` tool
- Rendered in preamble (section 9)
- Evicted by `turn-end-hook` (max 5)
- NOT in survivor set

### Belief Layer

Graph evidence becomes durable via `noesis_believe_fact(source: "graph")`:
```typescript
await pi.tools.noesis_believe_fact.execute("tc-1", {
  content: "auth.ts imports token.ts and session.ts",
  confidence: 1.0,  // From EXTRACTED
  source: "graph",
  tags: ["architecture"]
});
```

### Inference Layer

Graph findings can seed hypotheses:
```
Agent observes: "config.ts and deploy.ts have surprising connection"
Agent hypothesizes: "config.ts might be imported by deploy scripts"
Agent tests hypothesis via noesis_infer
```

### Learning Layer

Graph queries that fail become learning entries:
```
tool_result hook captures: "graphify query failed"
Learning entry: "Graphify query timeout on large codebase"
Fix: "Use more specific queries, or rebuild graph"
```

### Compaction Survival

Graph findings do NOT survive compaction. Only:
- Beliefs (from committed graph evidence)
- Workflow
- Learning
- Attention focus (not findings)

---

## 14. Configuration

### CAPS Constants (src/shared/schema.ts)

```typescript
CAPS.graphQueries = 5    // Max graph findings stored
CAPS.files = 10          // Max file references in attention
```

### Timeouts

| Operation | Timeout | Location |
|-----------|---------|----------|
| Graph query | 30s | `graphify-client.ts:84` |
| Graph build | 120s | `graphify-setup.ts:101` |

### Staleness Threshold

| Threshold | Value | Location |
|-----------|-------|----------|
| Graph freshness | 24 hours | `graphify-client.ts:50` |
| Belief staleness | 720 hours (30 days) | `CAPS.STALE_THRESHOLD_HOURS` |


### Query Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `depth` | 3 (Graphify default) | BFS/DFS traversal depth, max 6 |
| `token_budget` | 2000 (Graphify default) | Max tokens in query output |
| `mode` | "bfs" (Graphify default) | Traversal strategy: "bfs" or "dfs" |

**Note:** Noesis currently does NOT pass explicit depth, token_budget, or mode parameters to the Graphify CLI. Graphify's defaults control output size. Consider adding `CAPS.graphQueryTokenBudget` to bound output in future versions.

---
```
┌──────────────────────────────────────────────────────┐
│                      Noesis                           │
│                                                       │
│  ┌──────────┐    ┌────────────────┐    ┌──────────┐ │
│  │ Attention│◄───│ Graphify (CLI) │───►│  Belief  │ │
│  │ (ephemeral)│  └────────────────┘    │ (durable)│ │
│  └──────────┘         │                └──────────┘ │
│       │               │                    │          │
│       ▼               ▼                    ▼          │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐      │
│  │ Preamble │    │ Survivor │    │ Learning │      │
│  │ (render) │    │ (compact)│    │ (ranked) │      │
│  └──────────┘    └──────────┘    └──────────┘      │
└──────────────────────────────────────────────────────┘

Flow: Agent → noesis_attend → graphify query (CLI) → parser → attention → preamble → agent → noesis_believe_fact → belief → compaction survival
```

**Graphify is the perception input. Noesis is the cognitive engine.**

---

