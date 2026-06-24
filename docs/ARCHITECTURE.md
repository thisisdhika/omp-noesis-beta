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
│  External: Graphify CLI | .omp/noesis/ | Obsidian   │
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

### Vault Layer

| Module | Responsibility |
|---|---|
| `vault-store.ts` | Interface (push, pull, search) |
| `noop-vault-store.ts` | Fallback (no-op) |
| `obsidian-vault-store.ts` | Markdown + frontmatter projection |
| `obsidian-writer.ts` | Atomic note creation |
| `vault-detector.ts` | Backend resolution chain |
| `composite-vault-store.ts` | Memory + projection backends |
| `vault-retry.ts` | On-disk retry buffer |
| `local-vault-store.ts` | Append-only `MEMORY.md` |
| `mnemopi-vault-store.ts` | Bun:sqlite backend |

## Dependency Direction

```
schema/shared → infrastructure, domains, vault → rendering → hooks/tools → index
```

- Tools/hooks never import each other
- Domains never import hooks, tools, rendering, or vault
- No module imports `index.ts`

## State Flows

- **Durable write:** Tool/Hook → `stateManager.mutate()` → in-memory → `saveState()` → `state.json`
- **Attention:** `stateManager.mutate()` attention → `checkpointAttention()` → atomic save
- **Graph perception:** `noesis_attend` → Graphify query → parse → `attention.graphFindings`
- **Learning:** `tool_result` → capture → preamble surfaces unresolved → agent diagnoses → `noesis_believe_fact`
- **Compaction:** `session.compacting` → survivor selection → `preserveData.noesis` → rebuild from disk

## Error Recovery

| Scenario | Behavior |
|---|---|
| Corrupt state JSON | Rebuild from `EMPTY_STATE` (parse error caught) |
| State file I/O error | Rethrow — preserve on-disk data |
| Graphify unavailable | DEGRADED mode (graceful) |
| Graphify timeout | Return error, agent decides retry |
| Vault write fail | Buffer to `vault-retry.json`, retry next turn |
| Schema mismatch | Run migration pipeline or fail |

Security: all Graphify commands use `execFile`, paths validated to project tree, state writes atomic (temp → fsync → rename), no network in core path.
