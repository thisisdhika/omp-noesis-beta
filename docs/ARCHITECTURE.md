# omp-noesis: Architecture Specification

> **Version:** 0.1.0  
> **Date:** 2026-06-15  
> **Status:** Finalized

## 1. Overview

omp-noesis is an Oh My Pi extension that adds a structured cognitive substrate to the agent. It implements five layers of cognitive state (attention, belief, inference, commitment, learning) with formal belief revision, graph-grounded perception, and compaction survival.

## 2. System Context

```
┌─────────────────────────────────────────────────────────────────┐
│                         OMP Core                                │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌──────────────┐  │
│  │  Hooks    │  │ Compaction│  │ Session  │  │    Tools     │  │
│  └────┬─────┘  └─────┬─────┘  └────┬─────┘  └──────┬───────┘  │
│       │              │              │               │           │
├───────┼──────────────┼──────────────┼───────────────┼───────────┤
│       │              │              │               │           │
│  ┌────▼──────────────▼──────────────▼───────────────▼────────┐  │
│  │                    omp-noesis v0.1.0                       │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │                  src/index.ts (entry)                │  │  │
│  │  │  - registerTool(noesis_attend)                      │  │  │
│  │  │  - registerTool(noesis_believe)                     │  │  │
│  │  │  - registerTool(noesis_infer)                       │  │  │
│  │  │  - registerTool(noesis_commit)                      │  │  │
│  │  │  - registerTool(noesis_focus)                       │  │  │
│  │  │  - registerTool(noesis_recall)                      │  │  │
│  │  │  - registerTool(noesis_vault_search)                │  │  │
│  │  │  - on("context")                                    │  │  │
│  │  │  - on("session.compacting")                         │  │  │
│  │  │  - on("tool_result")                                │  │  │
│  │  │  - on("before_agent_start")                         │  │  │
│  │  │  - on("turn_end")                                   │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │                                                           │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │  │
│  │  │  Cognition   │  │  Perception  │  │   Learning   │    │  │
│  │  │  Layer       │  │  Layer       │  │   Layer      │    │  │
│  │  │              │  │              │  │              │    │  │
│  │  │ - schema.ts  │  │ - percept.ts │  │ - loop.ts    │    │  │
│  │  │ - preamble   │  │ - status.ts  │  │ - patterns   │    │  │
│  │  │ - survivors  │  │              │  │              │    │  │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │  │
│  │         │                 │                 │            │  │
│  │  ┌──────▼─────────────────▼─────────────────▼─────────┐  │  │
│  │  │              Persistence Layer                       │  │  │
│  │  │  - store.ts (atomic write)                          │  │  │
│  │  │  - migration.ts (schema versioning)                 │  │  │
│  │  │  - .omp/noesis/state.json                           │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │                                                           │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │              Workflow Layer                          │  │  │
│  │  │  - render.ts (living document)                      │  │  │
│  │  │  - engine.ts (dependency resolution)                │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                         External                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Graphify CLI │  │  .omp/noesis/│  │  Obsidian (optional) │  │
│  │ (perception) │  │  (state)     │  │  (export)            │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## 3. Module Responsibilities

### 3.1 Entry Point (`src/index.ts`)

- Creates runtime singleton
- Registers 7 tools with `pi.registerTool`
- Registers 5 hooks with `pi.on`
- No business logic, no state mutation during load

### 3.2 Schema (`src/schema.ts`)

- Zod schemas for all state, tool params, and internal types
- TypeScript interfaces exported for all modules
- Empty state factory
- ID generation utility
- Caps and constants

### 3.3 Infrastructure Layer

| Module | Responsibility |
|---|---|
| `filesystem-store.ts` | Atomic read/write of `state.json` (temp → fsync → rename) |
| `state-manager.ts` | In-memory authority: `read()`, `mutate()`, `checkpointAttention()` |
| `migrations.ts` | Sequential migration pipeline: v0 → v1 → v2 |
| `graphify-client.ts` | Graphify subprocess + MCP fallback, capability detection |
| `graphify-parser.ts` | Semi-structured NL → structured `GraphFinding` |
| `graphify-engine.ts` | Confidence mapping, stale penalty, community tags |
| `obsidian-writer.ts` | Atomic Markdown note creation (temp → fsync → rename) |

### 3.4 Domain Layer

| Domain | Files | Responsibility |
|---|---|---|
| Attention | `attention-domain.ts` | Focus, files, queries, ephemeral findings |
| Belief | `belief-domain.ts`, `revision-strategy.ts`, `confidence-strategy.ts` | Facts, decisions, AGM revision, confidence |
| Inference | `inference-domain.ts` | Hypotheses, reasoning, auto-promotion |
| Commitment | `commitment-domain.ts`, `consistency-strategy.ts` | Workflow, actions, dependency resolution |
| Learning | `learning-domain.ts`, `ranking-strategy.ts`, `eviction-strategy.ts` | Capture, ranking, retention |

### 3.5 Rendering Layer

| Module | Responsibility |
|---|---|
| `preamble-builder.ts` | Canonical ≤2000-token preamble renderer |
| `survivor-builder.ts` | Compaction survivor selection |
| `section-formatters.ts` | Per-section Markdown formatters |
| `focus-resolver.ts` | Focus fallback chain (attend → workflow → carry → default) |
| `state-cleanup.ts` | Stale/over-cap eviction |

### 3.6 Tool Adapters (`src/tools/`)

Thin wrappers over domain logic. Each validates params, calls domain, persists, returns structured result.

### 3.7 Hook Adapters (`src/hooks/`)

| Hook | File | Responsibility |
|---|---|---|
| `context` | `context-hook.ts` | Sole live preamble injector (read-only) |
| `before_agent_start` | `before-agent-start.ts` | Safety-net fallback (1-2 sentences) |
| `session.compacting` | `compaction-hook.ts` | Survivor + preserveData |
| `tool_result` | `tool-result-hook.ts` | Phase-1 learning capture |
| `turn_end` | `turn-end.ts` | Eviction + vault flush |

### 3.8 Vault Layer (`src/vault/`)

| Module | Responsibility |
|---|---|
| `vault-store.ts` | Interface: push, pull, search, validate |
| `noop-vault-store.ts` | No-op fallback (optionality guarantee) |
| `obsidian-vault-store.ts` | Markdown + frontmatter projection |
| `obsidian-merger.ts` | Conflict resolution for pulled artifacts |
| `vault-detector.ts` | Backend resolution chain |
| `vault-retry.ts` | On-disk retry buffer |
| `local-vault-store.ts` | Append-only MEMORY.md |
| `mnemopi-vault-store.ts` | Bun.sqlite backend |
| `hindsight-vault-store.ts` | Hindsight API backend |

## 4. Dependency Direction

```
schema/shared
  → infrastructure, domains, vault
    → rendering
      → hooks/tools/commands
        → index
```

**Rules:**
- `tools/` and `hooks/` depend on rendering and domains, never on each other
- `infrastructure/` depends on schema/shared only
- `domains/` never import hooks, tools, rendering, or vault code
- `rendering/` depends on domains and shared only
- `vault/` depends on schema/shared only
- `commands/` depends on infrastructure, not on hooks or tools
- `index.ts` composes everything; no other module imports `index.ts`

## 5. State Flow

### 5.1 Durable Write Path
```
Tool/Hook → stateManager.mutate() → in-memory mutation → synchronous saveState() → state.json
```

### 5.2 Attention Path
```
Tool/Context → stateManager.mutate() attention only → mark dirty → checkpointAttention() → atomic save
```

### 5.3 Graph Perception Path
```
noesis_attend → graphifyClient.query/update → parse/translate → attention.graphFindings (ephemeral)
→ buildPreamble renders once → graphFindings cleared → no durable belief until noesis_believe
```

### 5.4 Learning Path
```
tool_result → learning candidate/minimal failure capture → preamble surfaces unresolved learning
→ agent diagnoses → noesis_believe(type: "learning", learningId, rootCause, fix)
→ resolved learning retained + ranked higher
```

### 5.5 Compaction Path
```
session.compacting → survivor-builder selects bounded subset → preserveData.noesis gets full state
→ compaction-hook invalidates runtime freshness → next turn rebuilds from disk
```

## 6. Design Patterns

| Pattern | Application |
|---|---|
| Repository | `filesystem-store.ts` abstracts persistence |
| Unit of Work | `state-manager.ts` is the single mutation bottleneck |
| Strategy | AGM revision, confidence mapping, learning ranking |
| Factory | `vault-detector.ts` creates backend instances |
| Observer | Hook subscription, projection intent enqueueing |
| Command | Tool execution adapters |
| Adapter | OMP hook integration |
| Singleton | Runtime instance, Graphify client |
| Template Method | Preamble section rendering |
| Chain of Responsibility | Focus resolution fallback |
| Memento | Compaction survivor preservation |

## 7. Scalability

### 7.1 Horizontal
- State file size: Capped by survivor set + archive (archive not loaded into memory)
- Graphify queries: Serialized, 30s timeout, no parallel
- Vault projection: Batched per turn, async flush
- Preamble construction: Cached via state hash

### 7.2 Vertical
- Learning entries: Hard cap (100), rank-based eviction
- Belief facts: No hard cap (archive grows), only 10 active survive compaction
- Hypotheses: No hard cap, only 3 unresolved survive compaction
- Workflow steps: No hard cap, only current + next survive compaction

## 8. Error Recovery

| Scenario | Behavior |
|---|---|
| State file corrupted | Restore from `preserveData.noesis` or start EMPTY_STATE |
| Graphify not available | DEGRADED mode, no graph beliefs, agent continues |
| Graphify query timeout | Return error, agent decides retry |
| Vault write fails | Buffer to `vault-retry.json`, retry on next turn |
| Double preamble | `contextHookFired` flag prevents `before_agent_start` injection |
| Schema version mismatch | Run migration pipeline, fail if unsupported |

## 9. Security

- All Graphify commands use `execFile`, never `exec` or shell
- Graph paths validated to resolve within project tree
- State file writes are atomic (temp → fsync → rename)
- No network calls in core path (filesystem only)
- Vault projection is best-effort, never blocks mutation

## 10. References

- `docs/STATE_SCHEMA.md` — Exact state shape
- `docs/BELIEF_REVISION.md` — AGM model
- `docs/BOUNDARY_MATRIX.md` — Ownership matrix
- `docs/GRAPHIFY_CONTRACT.md` — Graphify integration
- `docs/OBSIDIAN_CONTRACT.md` — Projection contract
- `docs/TESTING_STRATEGY.md` — Testing methodology
