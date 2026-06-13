# omp-noesis: Graphify Integration Contract

> Version: 1.0
> Date: 2026-06-12
> Status: Aligned

---

## 1. Purpose

This document defines the exact integration contract between noesis and Graphify.

It answers:
- How does noesis detect and verify Graphify?
- What CLI commands does noesis use, and when?
- How does Graphify output become noesis cognitive state?
- What happens when Graphify is unavailable, stale, or broken?

Noesis does not wrap Graphify as a user-facing tool.
Noesis consumes Graphify as an internal perception layer.

---

## 2. Integration Philosophy

Graphify is the required perception substrate.
It provides codebase-grounded evidence that noesis translates into beliefs.

The governing principle:

> **Noesis queries Graphify. Noesis never builds the graph, never replaces the graph engine, and never exposes Graphify directly to the user.**

---

## 3. Availability Detection

Noesis must determine whether Graphify is usable before any query attempt.

### Detection sequence

```
1. Check Graphify installation:
   - Run: execFile("graphify", ["--version"])
   - Output: version string (e.g. "graphify v8.2.0")
   - If exit code ≠ 0: Graphify is not installed → DEGRADED mode

2. Check graph artifact existence:
   - Check: fs.existsSync("graphify-out/graph.json")
   - If missing: graph not yet built → NO_GRAPH mode

3. Check graph freshness:
   - Compare mtime of graphify-out/graph.json vs most recent source file mtime
   - If graph is older than the most recently modified source file: STALE mode
   - Heuristic: graph older than 24h → consider stale in active repos

4. Set capability level:
   - FULL: Graphify installed + graph exists + graph is fresh
   - STALE: Graphify installed + graph exists but may be outdated
   - NO_GRAPH: Graphify installed but no graph built
   - DEGRADED: Graphify not installed → no perception available
```

### Capability level → behavior

| Level | Querying | Belief grounding | Agent effect |
|---|---|---|---|
| **FULL** | Normal | Full confidence mapping | Full cognitive capability |
| **STALE** | Normal, but lower confidence | INFERRED cap reduced by one tier | Preamble notes "graph may be stale" |
| **NO_GRAPH** | Attempt `graphify .` to build; if fails, no queries | No graph-sourced beliefs possible | Preamble notes "graph not available" |
| **DEGRADED** | No queries possible | No graph-sourced beliefs | Preamble notes "Graphify not installed" |

---

## 4. CLI Command Surface

Noesis uses exactly these Graphify CLI commands. No others.

### 4.1 Status and build

```bash
# Is Graphify installed?
graphify --version

# Build the graph (first time or after NO_GRAPH detection)
graphify .

# Incremental update (preferred for freshness)
graphify update .
```

Noesis never passes flags that change extraction behavior (`--mode`, `--backend`, `--dedup-llm`, etc.). It uses Graphify's defaults.

### 4.2 Queries

```bash
# Natural language query (primary query interface)
graphify query "<question>" --graph graphify-out/graph.json

# Path between two symbols (used for impact analysis)
graphify path <source> <target> --graph graphify-out/graph.json

# Node detail (used for belief deepening)
graphify explain <node> --graph graphify-out/graph.json
```

### 4.3 OMP integration

```bash
# Install the Graphify skill for OMP discovery
graphify pi install
```

Noesis does not run this command automatically. It is a setup prerequisite documented for the developer.

### 4.4 Commands noesis never uses

- `graphify . --obsidian` — Obsidian export is handled separately by the optional Obsidian projection contract
- `graphify serve` — MCP server is an alternative integration path, not the v1 default
- `graphify global` — Cross-project graph is a future enhancement
- `graphify prs` — PR analysis is out of scope
- `graphify watch` — File watching is handled by OMP, not noesis
- `graphify hook install` — Git hooks are out of scope
- `graphify extract --backend ...` — Noesis uses default backend

---

## 5. Query Execution Contract

### 5.1 Executing a query

```
Input: queryString (string, from attention.graphQueries or direct tool call)

1. Build command:
   ["graphify", "query", queryString, "--graph", "graphify-out/graph.json"]

2. Execute via execFile (never shell):
   execFile("graphify", args, { timeout: 30000, cwd: projectRoot })

3. Handle result:
   - exitCode 0: parse output → structured findings
   - exitCode ≠ 0: capture stderr → error entry in execution log
   - timeout: return timeout error, do not retry

4. Parse output:
   Graphify query output is natural language + structured data.
   Noesis extracts: node names, relations, confidence labels, community labels.
```

### 5.2 Timeout and retry policy

| Scenario | Timeout | Retries |
|---|---|---|
| `graphify query` | 30s | 0 (fail fast, surface to agent) |
| `graphify update .` | 120s | 0 (long-running, one-shot) |
| `graphify .` (first build) | 300s | 0 (very long, one-shot) |
| `graphify --version` | 5s | 0 |

Noesis never retries a failed Graphify command. The agent decides whether to re-attempt.

### 5.3 Security

All commands use `execFile`, never `exec` or `sh -c`. This prevents shell injection.

Graph paths are validated: must resolve within the project tree or `graphify-out/`.

---

## 6. Output Parsing

### 6.1 Query output structure

Graphify query output is semi-structured natural language. Noesis extracts:

| Extractable element | How identified | Maps to |
|---|---|---|
| Node names | Capitalized identifiers, function/class names | Attention candidates, belief subjects |
| Relations | "calls", "imports", "depends on", "implements" | Belief content, edge type hints |
| Confidence | EXTRACTED / INFERRED / AMBIGUOUS labels | BeliefFact.confidence (see §7) |
| Community | "Community: <name>" labels | BeliefFact.communityScope |
| God nodes | "God nodes:" section | Priority attention targets |
| Surprising connections | "Surprising connections:" section | Flagged for agent review |

### 6.2 Parsing robustness

- If parsing fails partially, extract what is parseable and note the rest as `rawOutput` for agent inspection.
- Noesis never discards query output silently. Unparseable output is surfaced as `rawOutput` in the belief entry's metadata so the agent can inspect it.
- The agent, not noesis, decides whether unparseable output is still useful.

### 6.3 Community mapping

Graphify communities map to architectural domains in noesis:

```
Community "Authentication" → tag: "auth", communityScope: "Authentication"
Community "Database" → tag: "database", communityScope: "Database"
```

The community name becomes both a tag and a `communityScope` on derived beliefs.

---

## 7. Confidence Translation

This is the canonical mapping, aligned with boundary-matrix §8 and the belief revision model §9.

### Graphify → Noesis

| Graphify edge confidence | Noesis belief confidence | Classification |
|---|---|---|
| EXTRACTED | **1.0** | Active (always preamble-eligible) |
| INFERRED 0.95 | **0.95** | Active |
| INFERRED 0.85 | **0.85** | Active |
| INFERRED 0.75 | **0.75** | Active (threshold) |
| INFERRED 0.65 | **0.65** | Low-confidence |
| INFERRED 0.55 | **0.55** | Low-confidence |
| AMBIGUOUS | **never promoted** | Not converted to belief |

### Stale graph penalty

When the graph is stale, INFERRED confidence drops one tier:

| Normal | Stale penalty |
|---|---|
| 0.95 → | 0.85 |
| 0.85 → | 0.75 |
| 0.75 → | 0.65 |
| 0.65 → | 0.55 |
| 0.55 → | 0.55 (floor) |

EXTRACTED edges are never penalized (they are direct source facts, not inferences).

---

## 8. Evidence-to-Belief Pipeline

The full pipeline from Graphify evidence to noesis belief:

```
1. TRIGGER
   - Agent calls noesis_attend({ graphQueries: ["What auth patterns exist?"] })
   - OR attention.graphQueries is populated and `context` hook runs perception

2. DETECT
   - Check Graphify capability level
   - If DEGRADED or NO_GRAPH: skip pipeline, note in preamble

3. UPDATE (if stale)
   - If STALE: run `graphify update .` (incremental, fast)
   - If update fails: proceed with stale graph + confidence penalty

4. QUERY
   - Run `graphify query "<question>" --graph graphify-out/graph.json`
   - Timeout: 30s
   - Capture output

5. PARSE
   - Extract: nodes, relations, confidence labels, communities
   - Preserve rawOutput for unparseable portions

6. TRANSLATE
   - Apply confidence mapping (§7)
   - Apply stale penalty if applicable
   - Set source = "graph"
   - Set communityScope from community label
   - Add tags from community + extracted node types

7. COMMIT
   - Create BeliefFact entries from extracted findings
   - Do NOT auto-commit (separation of recall/commitment)
   - Populate attention with graph findings (files, god nodes, communities)
   - Surface findings in cognitive preamble
   - Agent decides what to explicitly believe via noesis_believe
```

### What is NOT auto-committed

- Graph findings are surfaced as evidence candidates in the preamble
- The agent must call `noesis_believe` to commit a graph finding as a belief
- This preserves the recall/commitment separation (ACC principle)
- The agent can commit verbatim, rephrase, or discard findings

---

## 9. Retrieval-Before-Read Policy

A central noesis behavior defined by the context management model (§8):

> **Query structure before loading bulk.**

### Policy

When the agent needs to understand codebase structure:

```
1. Query Graphify for relevant nodes, relations, and communities
2. From Graphify results, identify:
   - God nodes (start here)
   - Relevant communities (scope here)
   - Key relations (follow these)
3. Read only the files identified as high-relevance
4. Update beliefs with graph-grounded findings
```

### What this prevents
- Blind `read` of large files the agent doesn't need
- Transcript-heavy exploration
- File thrashing across irrelevant directories

---

## 10. Incremental Update Policy

### When noesis triggers an update

| Trigger | Command | Rationale |
|---|---|---|
| Graph is STALE (mtime older than most recent source file change) | `graphify update .` | Fast incremental refresh |
| Graph is NO_GRAPH | `graphify .` | First-time build |
| Explicit agent request via `noesis_attend` | `graphify update .` | Agent wants fresh evidence |
| After significant code changes (new files, refactors) | `graphify update .` | Perception must stay current |

### When noesis does NOT trigger an update

- Every turn (updates are expensive, run on-demand)
- Graph is already FRESH
- DEGRADED mode (Graphify not installed)

---

## 11. Error Handling

### Degraded mode behavior

When Graphify is not available:

```
1. Noesis sets capability = DEGRADED
2. Cognitive preamble includes: "Graphify not available. Codebase perception degraded."
3. noesis_attend still works but graphQueries are silently skipped
4. Graph-sourced beliefs cannot be created
5. The agent relies on execution-sourced and user-sourced beliefs only
```

### Graph build failure

```
1. If graphify . fails (exit code ≠ 0):
   - Log the error
   - Set capability = NO_GRAPH (not DEGRADED)
   - Surface the failure in preamble: "Graphify build failed. Graph may need manual rebuild."
```

### Query failure

```
1. If a query fails (timeout, non-zero exit):
   - Return structured error to the agent
   - Do not retry (the agent decides)
   - The error does not affect existing beliefs
```

---

## 12. MCP Server Path (Future)

Graphify also supports an MCP server path:

```bash
python -m graphify.serve graphify-out/graph.json
```

This exposes structured tools: `query_graph`, `get_node`, `get_neighbors`, `shortest_path`.

The MCP path provides structured JSON output instead of semi-structured natural language. This would eliminate the parsing step (§6) and provide more reliable confidence extraction.

**v1 decision**: noesis uses CLI-based queries (`graphify query`). MCP integration is a future enhancement that would simplify parsing and improve reliability. The contract is designed so the CLI and MCP paths can coexist — the translation pipeline (§8) is the same regardless of transport.

---

## 13. Graphify Setup Prerequisites

For noesis to operate at FULL capability, the developer must:

```bash
# 1. Install Graphify (pip or equivalent)
pip install graphify

# 2. Build the initial graph
cd /path/to/project
graphify .

# 3. Install the OMP skill (optional, for agent awareness)
graphify pi install

# 4. Verify
graphify --version
ls graphify-out/graph.json
```

Noesis checks these prerequisites at startup and reports capability level in the preamble.

---

## 14. Non-Goals

Noesis's v1 Graphify integration deliberately excludes:

| Non-goal | Why excluded |
|---|---|
| Building the graph automatically on first use | Graphify build is too slow for runtime; must be pre-built |
| Using Graphify MCP server instead of CLI | MCP adds transport complexity; CLI is simpler for v1 |
| Cross-project global graph queries | Single-project scope for v1 |
| `graphify watch` for automatic rebuilds | File watching is OMP's concern |
| PR impact analysis via `graphify prs` | Out of scope for cognition |
| Custom extraction backends or modes | Noesis uses Graphify defaults |
| Parsing Graphify's HTML/SVG/Neo4j exports | Only `graph.json` and query output |

---

## 15. Design Rules

1. **Noesis queries Graphify; it never builds, replaces, or wraps it as a user tool.**
2. **Graph evidence is surfaced as candidates, not auto-committed as beliefs.**
3. **CLI only for v1; MCP is a future enhancement path.**
4. **Confidence is always evidence-grounded for graph-sourced beliefs.**
5. **Stale graphs get confidence penalties, not query refusals.**
6. **DEGRADED mode is graceful: the rest of noesis still works without perception.**
7. **All Graphify commands use execFile, never shell.**

---

## 16. References

Internal grounding:
- `docs/PRD.md`
- `docs/boundary-matrix.md` (§8: confidence translation contract)
- `docs/context-management-model.md` (§8: retrieval-before-read, §14.4: Graphify relevance signals)
- `docs/cognitive-state-schema.md` (BeliefFact, BeliefSource)
- `docs/belief-revision-model.md` (§9: source-based confidence rules)
- `docs/research/04-graphify-labs.md`

External grounding:
- Graphify Labs: https://graphifylabs.ai/
- Graphify repository: https://github.com/safishamsi/graphify
- Graphify forced-rank confidence (PR #546): https://github.com/safishamsi/graphify/pull/546
- Graphify how-it-works (v8): https://github.com/safishamsi/graphify/blob/v8/docs/how-it-works.md
- Graphify MCP tools: https://github.com/CristianoCiuti/graphify-mcp-tools (deprecated, for reference)
