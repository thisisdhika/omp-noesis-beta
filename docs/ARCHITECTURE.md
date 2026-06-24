# Architecture Specification

> **Version:** 1.0.0 | **Updated:** 2026-06-24

## Overview

omp-noesis is an Oh My Pi extension that adds structured cognitive layers — attention, belief, inference, commitment, and learning — with graph-grounded perception and compaction survival.

## System Context

```
┌────────────────────────────────────────────────────────┐
│                     OMP Core                           │
│  Hooks  |  Compaction  |  Session  |  Tools            │
│────┬──────┬──────────────┬──────────┬──────────┬───────│
│    │      │              │          │          │       │
│  ┌─▼──────▼──────────────▼──────────▼──────────▼─┐   │
│  │              omp-noesis v1.0.0                 │   │
│  │  ┌─────────────────────────────────────────┐  │   │
│  │  │  src/index.ts (entry)                   │  │   │
│  │  │  · 7 tools registered                   │  │   │
│  │  │  · 5 hooks registered                   │  │   │
│  │  └─────────────────────────────────────────┘  │   │
│  │  ┌────────┐ ┌──────────┐ ┌──────────┐        │   │
│  │  │Cognition│ │Perceptn │ │ Learning │        │   │
│  │  │(domains)│ │(graphify)│ │(ranking) │        │   │
│  │  └────┬───┘ └────┬─────┘ └────┬─────┘        │   │
│  │  ┌────▼──────────▼────────────▼─────────┐    │   │
│  │  │        Persistence Layer             │    │   │
│  │  │  state.json | migrations             │    │   │
│  │  └──────────────────────────────────────┘    │   │
│  │  ┌──────────────────────────────────────┐    │   │
│  │  │      Context Curation Layer          │    │   │
│  │  │  preamble-builder | consistency      │    │   │
│  │  └──────────────────────────────────────┘    │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
├──────────────────────────────────────────────────────┤
│  External: Graphify CLI | OMP Memory | .omp/noesis/ | Obsidian   │
└──────────────────────────────────────────────────────┘
```

## Module Map

### Entry Point (`src/index.ts`)

Creates the runtime singleton, registers 7 tools (`noesis_attend`, `noesis_believe_fact`, `noesis_believe_decision`, `noesis_infer`, `noesis_commit`, `noesis_state_inspect`, tool-store hooks), and 5 hooks (`context`, `before_agent_start`, `session.compacting`, `tool_result`, `turn_end`). No business logic during load.

### Schema (`src/shared/schema.ts`)

Zod schemas for all state shapes, tool parameters, and internal types. Exports TypeScript interfaces, empty state factory, ID generation, and caps/constants.

### Infrastructure Layer

| Module | Responsibility |
|---|---|
| `filesystem-store.ts` | Atomic read/write of `state.json` |
| `state-manager.ts` | In-memory authority, checkpointing |
| `migrations.ts` | Schema version upgrades |
| `graphify-client.ts` | Graphify subprocess + MCP fallback |
| `graphify-parser.ts` | NL output → structured `GraphFinding` |
| `graphify-setup.ts` | CLI detection and build invocation |

### Domain Layer

| Domain | Files | Responsibility |
|---|---|---|
| Attention | `attention-domain.ts` | Focus, files, queries, ephemeral findings |
| Belief | `belief-domain.ts`, `revision-strategy.ts`, `confidence-strategy.ts` | Facts, decisions, AGM revision |
| Inference | `inference-domain.ts` | Hypotheses, reasoning, auto-promotion |
| Commitment | `commitment-domain.ts`, `consistency-strategy.ts` | Workflow, actions, dependency resolution |
| Learning | `learning-domain.ts`, `ranking-strategy.ts`, `eviction-strategy.ts` | Capture, ranking, retention |

### Rendering Layer

| Module | Responsibility |
|---|---|
| `preamble-builder.ts` | ≤2000-token context curation |
| `survivor-builder.ts` | Compaction survivor selection |
| `section-formatters.ts` | Per-section Markdown |
| `focus-resolver.ts` | Focus fallback chain |

End-turn eviction is orchestrated by `EndTurnCleanupUseCase` in the application layer.

### Application Layer (Use Cases)

| Use Case | Responsibility |
|---|---|
| `hydrate-from-memory.ts` | Query OMP memory → parse → dedup → import Noesis beliefs at session start |
| `add-belief-fact.ts` | Create belief fact with conflict/contradiction detection |
| `add-belief-decision.ts` | Create belief decision with rationale |
| `add-hypothesis.ts` | Create hypothesis in inference layer |
| `confirm-hypothesis.ts` | Transition hypothesis to confirmed |
| `add-reasoning-step.ts` | Add reasoning step to inference layer |
| `attend.ts` | Update attention focus with graph perception |
| `capture-learning.ts` | Capture tool results as learning entries |
| `extend-workflow.ts` / `replace-workflow.ts` / `update-workflow-step.ts` | Workflow lifecycle |
| `end-turn-cleanup.ts` | Eviction orchestration after tool execution |

### OMP Memory Integration

The OMP memory bridge enables cross-session durability while keeping `state.json` authoritative:

```
Tool/Hook → state.json (authoritative write)
              ↓ (best-effort bridge via retainToOmp)
           OMP memory → hydration at next session start
                           ↓ (optional)
                        Obsidian vault (human-readable projection)
```

**Bridge direction:**

| Operation | Source | Target | Mechanism |
|---|---|---|---|
| Durability write | `noesis_believe_fact` | OMP memory | `runtime.retainToOmp()` — best-effort |
| Durability write | `noesis_believe_decision` | OMP memory | `runtime.retainToOmp()` — best-effort |
| Hydration read | OMP memory | state.json | `HydrateFromMemoryUseCase` at session start |
| Projection write | state.json | Obsidian vault | `vaultStore.push()` — best-effort |

**Key properties:**
- OMP memory entries carry `[noesis/belief]` or `[noesis/decision]` prefix in their content string
- Context string stores `id`, `confidence`, `source`, `tags` as structured key-value pairs
- Hydration uses content-hash deduplication to avoid duplicates
- Both bridges are best-effort — failures are caught silently, never propagated

### Vault Layer

| Module | Responsibility |
|---|---|
| `vault-store.ts` | Interface (push, pull, search) |
| `noop-vault-store.ts` | Fallback (no-op) |
| `obsidian-vault-store.ts` | Markdown + frontmatter projection |
| `obsidian-writer.ts` | Atomic note creation |
| `vault-detector.ts` | Backend resolution chain |
| `vault-retry.ts` | On-disk retry buffer |

## Dependency Direction

```
schema/shared → infrastructure, domains, vault → rendering → hooks/tools → index
```

- Tools/hooks never import each other
- Domains never import hooks, tools, rendering, or vault
- No module imports `index.ts`

## State Flows

- **Durable write:** Tool/Hook → `stateManager.mutate()` → in-memory → `saveState()` → `state.json`
- **OMP memory bridge (write):** `noesis_believe_fact`/`noesis_believe_decision` → `runtime.retainToOmp()`
  → OMP memory `save()` — best-effort, async, never blocks the tool response
- **Session-start hydration (read):** `before_agent_start` hook → `HydrateFromMemoryUseCase.execute()`
  → OMP memory `search("[noesis/belief]")` + `search("[noesis/decision]")`
  → parse → content-hash dedup → bulk import with capped confidence (≤0.75)
- **Attention:** `stateManager.mutate()` attention → `checkpointAttention()` → atomic save
- **Graph perception:** `noesis_attend` → Graphify query → parse → `attention.graphFindings`
- **Learning:** `tool_result` → capture → preamble surfaces unresolved → agent diagnoses → `noesis_believe_fact`
- **Compaction:** `session.compacting` → survivor selection → `preserveData.noesis` → rebuild from disk


## Bidirectional Sync Model

### Architecture Rule

Three storage tiers with clear authority:

| Tier | Role | Authority |
|---|---|---|
| **state.json** | Cognitive state authority | Always authoritative — all tools read/write here |
| **OMP Memory** | Cross-session durability channel | Supplements state.json on startup — never overwrites local state |
| **Obsidian vault** | Human-readable projection | Write-only — best-effort, never read for cognition |

### Hydration Flow (Session Start)

```
OMP Core session start
  → before_agent_start hook fires
    → HydrateFromMemoryUseCase.execute()
      → runtime.getMemoryStatus()
      → if searchable:
        → Promise.all([search("[noesis/belief]"), search("[noesis/decision]")])
        → for each entry: parseContext() → contentHash() dedup
        → import as BeliefFact/BeliefDecision with source:"omp-memory"
      → commit via UnitOfWork
```

### Degradation Paths

| State | Behavior |
|---|---|
| OMP memory offline | `getMemoryStatus()` returns `{backend:"off"}` → hydration skipped |
| OMP memory readable but not writable | Hydration proceeds; write bridge silently fails |
| No OMP memory → Obsidian only | Noesis works 100% standalone; vault projection still works |
| OMP memory + Obsidian both available | Full bidirectional sync: state.json ↔ OMP memory ↔ Obsidian |

## Error Recovery

| Scenario | Behavior |
|---|---|
| Corrupt state JSON | Rebuild from `EMPTY_STATE` (parse error caught) |
| State file I/O error | Rethrow — preserve on-disk data |
| Graphify unavailable | DEGRADED mode (graceful) |
| Graphify timeout | Return error, agent decides retry |
| Vault write fail | Buffer to `vault-retry.json`, retry next turn |
| Schema mismatch | Run migration pipeline or fail |
| OMP memory write bridge fails | Caught silently — non-critical, state.json is authoritative |
| OMP memory search fails | Returns `[]` — hydration gracefully skips |
| OMP memory backend unavailable | No hydration, no write bridge — Noesis operates standalone |

Security: all Graphify commands use `execFile`, paths validated to project tree, state writes atomic (temp → fsync → rename), no network in core path.
