# omp-noesis: Graphify Integration Contract

> **Version:** 0.1.0  
> **Date:** 2026-06-15  
> **Status:** Finalized

## 1. Integration Philosophy

Graphify is the required perception substrate. Noesis queries Graphify but never builds, replaces, or wraps it as a user tool.

## 2. Availability Detection

```
1. Check Graphify installation: graphify --version
2. Check graph artifact: graphify-out/graph.json exists?
3. Check freshness: mtime of graph vs most recent source file
4. Set capability: FULL | STALE | NO_GRAPH | DEGRADED
```

## 3. CLI Commands Used

```bash
graphify --version           # Availability check
graphify .                   # First-time build
graphify update .            # Incremental update
graphify query "..." --graph graphify-out/graph.json   # Primary query
graphify path <src> <tgt> --graph graphify-out/graph.json  # Impact analysis
graphify explain <node> --graph graphify-out/graph.json    # Deep dive
```

## 4. Commands Never Used

- `graphify . --obsidian` (Obsidian export handled separately)
- `graphify serve` (MCP is future enhancement)
- `graphify global` (Cross-project is future)
- `graphify prs` (Out of scope)
- `graphify watch` (OMP handles file watching)

## 5. Query Execution Contract

```
Input: queryString
1. Build: ["graphify", "query", queryString, "--graph", "graphify-out/graph.json"]
2. Execute: Bun.spawn with timeout 30s
3. Parse: Extract nodes, relations, confidence, communities
4. Handle: exitCode 0 → findings; ≠0 → error; timeout → timeout error
```

## 6. Confidence Translation

| Graphify | Noesis | Stale Penalty |
|---|---|---|
| EXTRACTED | 1.0 | None |
| INFERRED 0.95 | 0.95 | → 0.85 |
| INFERRED 0.85 | 0.85 | → 0.75 |
| INFERRED 0.75 | 0.75 | → 0.65 |
| INFERRED 0.65 | 0.65 | → 0.55 |
| INFERRED 0.55 | 0.55 | Floor 0.55 |
| AMBIGUOUS | Never promoted | — |

## 7. Evidence-to-Belief Pipeline

```
1. TRIGGER: Agent calls noesis_attend with graphQueries
2. DETECT: Check capability level
3. UPDATE: If stale, run graphify update .
4. QUERY: Run graphify query with 30s timeout
5. PARSE: Extract structured findings
6. TRANSLATE: Apply confidence mapping, stale penalty, tags
7. COMMIT: Surface in preamble as ephemeral findings
   → Agent must call noesis_believe to commit as durable belief
```

## 8. Retrieval-Before-Read Policy

```
1. Query Graphify for relevant nodes, relations, communities
2. Identify god nodes (start here), communities (scope here), key relations (follow these)
3. Read only high-relevance files
4. Update beliefs with graph-grounded findings
```

## 9. Error Handling

| Scenario | Behavior |
|---|---|
| DEGRADED | Preamble notes "Graphify not available", no queries |
| NO_GRAPH | Attempt `graphify .`, if fails → no graph beliefs |
| Query timeout | Return error, agent decides retry |
| Parse failure | Preserve rawOutput, surface for agent inspection |

## 10. MCP Server Path (Future)

```bash
python -m graphify.serve graphify-out/graph.json
```

Provides structured JSON output. v1 uses CLI; MCP is future enhancement.

## 11. Design Rules

1. Noesis queries Graphify; never builds, replaces, or wraps it.
2. Graph evidence is surfaced as candidates, not auto-committed.
3. CLI only for v1; MCP is future enhancement.
4. Confidence is always evidence-grounded for graph sources.
5. Stale graphs get confidence penalties, not query refusals.
6. DEGRADED mode is graceful: rest of noesis still works.
7. All Graphify commands use Bun.spawn, never shell.
