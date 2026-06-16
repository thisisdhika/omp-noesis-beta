# Session Handoff — 2026-06-16

## What Shipped

### Graphify Enhancement (commit 369e372)

**Phase 1: Data Pipeline Fix (P0)**
- Parser now extracts all 5 optional GraphFinding fields: inferredConfidence, community, godNodes, surprisingConnections, rawOutput
- 8 new parser tests added (27 total, all passing)
- GRAPHIFY_BEST_PRACTICES_AUDIT.md updated with P0 priority section

**Phase 2: Production Hardening (P1)**
- query() returns `QueryResult {findings, error?, duration}` instead of silent `[]`
- attend-tool.ts updated to use new return type
- GRAPHIFY_DEEP_DIVE.md: fixed duplicated Section 2
- GRAPHIFY_CONTRACT.md: updated 5 sections to match actual code behavior

**Phase 3: Documentation Cleanup (P2)**
- contextUsage field documented in schema section
- confidence-strategy.ts referenced in file breakdown
- Query budget/limits documented in configuration section
- Aspirational content (MCP, auto-update, retrieval-before-read) labeled as future

**Phase 4: Minor Improvements (P3)**
- Capability cache lifetime documented
- Dual capability indicators explained
- Confidence mapping clarified as manual, not automatic

### Test Results
- 563/568 pass (5 pre-existing failures from mock.module leakage)
- 0 TypeScript errors

---

## What's Next: MCP Integration

The user wants to adopt MCP now (pre-release). This means replacing the CLI subprocess approach with the Graphify MCP server.

### Current Architecture (CLI)
```
Agent → noesis_attend → graphify-client.ts → Bun.spawn(["graphify", "query", ...]) → parser → attention
```

### Target Architecture (MCP)
```
Agent → noesis_attend → graphify-mcp-client.ts → MCP server (persistent) → parser → attention
```

### Key Decisions Needed

1. **MCP Server Lifecycle**
   - Start on first query? Or on session start?
   - Restart on crash? How many retries?
   - Kill on session end?

2. **MCP Protocol**
   - Use `python -m graphify.serve` (stdio MCP)
   - Or use HTTP MCP if available
   - How to handle connection errors?

3. **Query Mapping**
   - CLI: `graphify query "..." --graph path`
   - MCP: `query_graph(question, mode, depth, token_budget)`
   - How to map parameters?

4. **Fallback**
   - If MCP server unavailable, fall back to CLI?
   - Or fail gracefully with DEGRADED?

5. **State Management**
   - MCP server holds graph in memory
   - Noesis doesn't need to manage graph state
   - But need to handle server restarts

### Files to Create/Modify

| File | Action |
|------|--------|
| `src/infrastructure/graphify-mcp-client.ts` | NEW — MCP server lifecycle + query |
| `src/infrastructure/graphify-client.ts` | MODIFY — add MCP detection, fallback to CLI |
| `src/hooks/context-hook.ts` | MODIFY — start MCP server on session start |
| `src/tools/attend-tool.ts` | MODIFY — use MCP client when available |
| `tests/integration/graphify-mcp.test.ts` | NEW — MCP integration tests |

### Research Needed

1. Read Graphify MCP server source (`graphify/serve.py`) to understand:
   - Available tools (query_graph, get_node, get_neighbors, etc.)
   - Input/output schemas
   - Error handling
   - Startup requirements

2. Read MCP protocol spec to understand:
   - How to spawn and communicate with MCP server
   - JSON-RPC message format
   - Error codes

3. Check if there's an MCP client library for TypeScript/Bun

---

## Open Questions for User

1. Should MCP be the PRIMARY integration, with CLI as fallback? Or MCP-only?
2. Should the MCP server start automatically on session start, or lazily on first query?
3. Do we want to expose all MCP tools (get_node, get_neighbors, shortest_path, etc.) or just query_graph?
4. What's the target latency for queries? (MCP should be sub-second vs CLI 30s timeout)
