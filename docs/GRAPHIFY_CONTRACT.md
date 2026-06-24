# Graphify Integration Contract

> **Version:** 1.0.1 | **Updated:** 2026-06-24

Graphify is the required perception substrate. MCP is the primary LLM-to-Graphify path; CLI is the fallback for automated Noesis-internal queries.

## Availability Detection

1. Check Graphify installation: `graphify --version`
2. Check graph artifact: `graphify-out/graph.json` exists?
3. Check freshness: mtime of graph vs most recent source file
4. Set capability: `FULL | STALE | NO_GRAPH | DEGRADED`

## CLI Commands

```
graphify --version                        # Availability check
graphify .                                # First-time build
graphify . --no-viz                       # Build without visualization
graphify . --update                       # Incremental update
graphify query "..." --graph <path>       # Query
```

### Never Used

`graphify . --obsidian`, `graphify serve`, `graphify global`, `graphify prs`, `graphify watch`

## Query Execution Contract

1. Validate graph exists at `graphify-out/graph.json` — else return error
2. Spawn `graphify query "..." --graph <path>` with 30s timeout
3. Parse output: nodes, relations, confidence + optional fields
4. Return `{findings: GraphFinding[], error?: string, duration}`
5. Any error → structured error (never silent)

## Confidence Handling

The parser preserves Graphify's raw confidence:

| Graphify | Parser Output |
|---|---|
| `EXTRACTED` | `confidence: "EXTRACTED"` |
| `INFERRED` | `confidence: "INFERRED"` |
| `AMBIGUOUS` / unknown | `confidence: "AMBIGUOUS"` |
| `inferredConfidence: 0.55–0.95` | Preserved as-is |

## Evidence-to-Belief Pipeline

1. **Trigger:** Agent calls `noesis_attend(graphQueries)`
2. **Query:** Graphify CLI (30s timeout)
3. **Parse:** `parseQueryOutput()` → structured findings
4. **Surface:** Findings in `attention.graphFindings` and preamble
5. **Commit:** Agent calls `noesis_believe_fact(source="graph")` with stale penalty if applicable

## Retrieval-Before-Read Policy (v1)

Graph-backed turns must query Graphify before reading project files. `noesis_attend(graphQueries)` is the enforcement point. The resulting evidence guides file selection to the high-relevance subset.

## Error Handling

| Scenario | Behavior |
|---|---|
| Graph file missing | `query()` returns `{findings: [], error}` |
| Timeout (30s) | Caught → structured error |
| Binary missing | `detectCapability()` returns `DEGRADED` — graph operations skipped, Noesis continues standalone without graph perception. All other systems unaffected. |
| JSON parse failure | Warning → returns `[]` |
| MCP server fails | Error logged → CLI fallback |
| MCP connection lost | OMP detects → reconnects; CLI fallback during reconnection |

## MCP Integration

MCP is the primary query path for LLM-to-Graphify queries.

- Server starts lazily on first graph query
- Server command: `python -m graphify.serve graphify-out/graph.json`
- OMP manages lifecycle and reconnection
- No custom MCP client needed

### CLI Fallback

The CLI is used for:
- attend-tool preamble evidence queries (automated, no LLM in loop)
- Graph build/update operations
- Detection and capability checks
- MCP server startup failures

## Design Rules

1. Noesis queries Graphify before reading files when graphQueries present
2. Graph evidence is surfaced as candidates, never auto-committed
3. MCP is primary query path; CLI is fallback for automated/build ops
4. Confidence is always evidence-grounded for graph sources
5. Stale → confidence penalty; query refusals reserved for errors
6. DEGRADED is a capability label only — graceful; noesis continues standalone without graph perception
7. All Graphify commands use `Bun.spawn`, never shell
