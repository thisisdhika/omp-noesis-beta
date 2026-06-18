# omp-noesis: Graphify Integration Contract

> **Version:** 0.1.0  
> **Date:** 2026-06-15  
> **Status:** Finalized

Graphify is the required perception substrate. Noesis queries Graphify but never builds, replaces, or wraps it as a user tool.

MCP is the primary integration path for LLM-to-Graphify queries. The CLI is the primary path for Noesis-internal automated queries (attend-tool preamble evidence). OMP manages the MCP server lifecycle — no custom client is needed.


## 2. Availability Detection

```
1. Check Graphify installation: graphify --version
2. Check graph artifact: graphify-out/graph.json exists?
3. Check freshness: mtime of graph vs most recent source file
4. Set capability: FULL | STALE | NO_GRAPH | DEGRADED
```

MCP tools are the primary query path for LLM graph queries. CLI commands below serve as the fallback for attend-tool automated queries and for OMP-orchestrated build/update operations.

## 3. CLI Commands Used

```bash
graphify --version           # Availability check
graphify .                   # First-time build
graphify . --no-viz          # First-time build without visualization
graphify . --update          # Incremental update
graphify query "..." --graph graphify-out/graph.json   # Primary query
```

## 4. Commands Never Used

- `graphify . --obsidian` (Obsidian export handled separately)
- `graphify serve` (MCP server launched by OMP directly, not via CLI)
- `graphify global` (Cross-project is future)
- `graphify prs` (Out of scope)
- `graphify watch` (OMP handles file watching)

## 5. Query Execution Contract

```
Input: queryString
1. Validate graph path exists at graphify-out/graph.json
   → If not found, return {findings: [], error: "No graph file found", duration}
2. Build: ["graphify", "query", queryString, "--graph", graphPath]
3. Execute: Bun.spawn with timeout 30s
4. Parse: Extract nodes, relations, confidence + optional fields:
   - inferredConfidence (number, 0.55–0.95)
   - community (string)
   - godNodes (string[])
   - surprisingConnections (string[])
   - rawOutput (string)
5. Return: {findings: GraphFinding[], error?: string, duration: number}
6. Any error (timeout, spawn failure, parse failure) →
   {findings: [], error: <message>, duration} (structured error, never silent)
```
## 6. Confidence Handling

The parser preserves Graphify's raw confidence category and optional numeric value.
No automatic remapping or stale penalty is applied in code — the agent interprets
these fields when committing beliefs.

| Graphify | Parser Output | Notes |
|---|---|---|
| confidence: "EXTRACTED" | confidence: "EXTRACTED" | Direct pass-through |
| confidence: "INFERRED" | confidence: "INFERRED" | Direct pass-through |
| confidence: "AMBIGUOUS" (or unknown) | confidence: "AMBIGUOUS" | Fallback for missing/unrecognized values |
| inferredConfidence: 0.55–0.95 | inferredConfidence preserved | Optional numeric field, validated to [0.55, 0.95] |

> **Stale penalty (-0.10):** The agent should deduct -0.10 from INFERRED findings when the graph is stale (>24h). The system surfaces staleness via capability level (STALE). System-level automatic deduction is a design goal for a future revision.

## 7. Evidence-to-Belief Pipeline

```
1. TRIGGER: Agent calls noesis_attend with graphQueries
2. QUERY: CLI (`graphify query "..." --graph <path>`) via graphify-client.query() with 30s timeout.
   MCP is used when the LLM itself queries Graphify; attend-tool always uses the CLI path.
   Note: No capability check or auto-update for stale graphs.
   Agent must manually run `graphify . --update` if needed.
3. PARSE: parseQueryOutput extracts structured findings (nodes, relations,
   confidence, timestamp, optional fields)
4. SURFACE: Findings stored in attention.graphFindings and attention.pendingEvidence.
   Shown in preamble as "Graph evidence (N): — <query text>".
   Pending evidence entries auto-expire after 3 turns via decayPendingEvidence().
5. COMMIT: Agent calls noesis_believe(source="graph") to persist as durable belief fact.
   When committing from graph evidence, pass confidence mapped from the finding's
   confidence label (see §6 Confidence Handling) and include the finding summary
   in the evidence parameter for provenance tracking.
```
## 8. Retrieval-Before-Read Policy (Future — v2)

> `noesis_attend(graphQueries)`, which runs MCP queries (or CLI fallback) and stores
> findings in attention. There is no automatic enforcement of "query graph before
> reading files" — that discipline is left to the agent's judgment.
>
> Planned for v2:
> 1. Query Graphify for relevant nodes, relations, communities
> 2. Identify god nodes (start here), communities (scope here), key relations (follow these)
> 3. Read only high-relevance files
> 4. Update beliefs with graph-grounded findings

## 9. Error Handling

| Scenario | Actual Behavior |
|---|---|
| Graph file missing | `query()` returns `{findings: [], error: "No graph file found", duration}` |
| Bun.spawn timeout (30s) | Caught by try/catch → `{findings: [], error: <timeout message>, duration}` |
| Bun.spawn failure (binary missing) | `detectCapability` returns DEGRADED; query not attempted |
| JSON parse failure | `parseQueryOutput` returns `[]` (silent empty findings) |
| Unknown confidence value | Normalised to `"AMBIGUOUS"` |
| All findings invalid (mixed input) | Valid findings kept; invalid entries silently skipped |
| MCP server fails to start | Init-command or runtime startup → error logged; falls back to CLI queries |
| MCP tool call fails | Configurable retry logic; after max retries → CLI fallback |
| MCP connection lost | OMP detects disconnection; next query triggers reconnection; CLI fallback during reconnection |

## 10. MCP Integration

MCP (Model Context Protocol) is the primary query interface for LLM-to-Graphify queries.

### Server Lifecycle (managed by OMP)

- MCP server starts lazily on first graph query
- Server command: `python -m graphify.serve graphify-out/graph.json`
- Server persists for the session; OMP manages reconnection on failure
- No custom MCP client needed — LLM tools call MCP tools directly

### Query Flow

1. LLM makes MCP tool call to graphify query
2. If MCP unavailable → CLI fallback via `graphify query "..." --graph graphify-out/graph.json`
3. Results in structured JSON regardless of path

### CLI Fallback

The CLI remains the fallback for:
- attend-tool preamble evidence queries (automated, no LLM in loop)
- Graph build/update operations
- Detection and capability checks
- MCP server startup failures


## 11. Design Rules

1. Noesis queries Graphify; never builds, replaces, or wraps it.
2. Graph evidence is surfaced as candidates, not auto-committed.
3. MCP is primary query path; CLI is fallback for automated and build operations.
4. Confidence is always evidence-grounded for graph sources.
5. Stale graphs get confidence penalties, not query refusals.
6. DEGRADED mode is graceful: rest of noesis still works.
7. All Graphify commands use Bun.spawn, never shell.
