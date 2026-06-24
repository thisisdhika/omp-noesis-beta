# Boundary Matrix

> **Version:** 1.0.1 | **Updated:** 2026-06-24

## Governing Rule

> Noesis fills the cognitive gaps around OMP, not reimplements OMP itself.

## System Roles

| System | Role | Runtime-Critical |
|---|---|---|
| **OMP** | Execution substrate | Yes |
| **Graphify** | Perception substrate | Yes (core dependency) |
| **Noesis** | Cognitive substrate | Yes |
| **Obsidian** | Reflection substrate | No |

## Context Ownership

- **OMP** owns: turns, message history, tool execution, hooks, compaction, subagent isolation
- **Graphify** owns: codebase knowledge graph, graph queries, Leiden communities, confidence edges
- **Noesis** owns: structured state, smart-zone (≤2000-token) protection, Graphify→beliefs translation, compaction survival, learning ranking
- **Obsidian** owns: optional human-facing projection — not runtime-critical

## Source-of-Truth Matrix

| Concern | Owner |
|---|---|
| Tool execution, agent orchestration | OMP |
| Compaction pipeline, skill loading | OMP |
| Long-term general memory | OMP / Mnemopi |
| Code graph construction & query | Graphify |
| Cognitive state, beliefs, decisions | Noesis |
| AGM belief revision | Noesis |
| Learning from execution | Noesis |
| Smart-zone protection | Noesis |
| Human-readable projection | Obsidian |

## Hard Ownership Rules

1. **OMP is the runtime authority** — if it must happen for a turn/compaction/orchestration, OMP owns it
2. **Graphify is the graph authority** — if it queries/clusters/explains code structure, Graphify owns it
3. **Noesis is the cognition authority** — if it changes what the agent believes/remembers/learns, Noesis owns it
4. **Obsidian is never runtime-critical** — removing it must not affect behavior

## Must Never Duplicate

- No separate orchestration engine, compaction, or agent runtime (OMP's job)
- No graph extractor, store, query language, or community detector (Graphify's job)
- No note editor, vault UI, or backlink engine (Obsidian's job)

## Translation Contracts

- **Graphify → Noesis**: graph findings → beliefs, confidence scores, evidence provenance
- **OMP → Noesis**: hooks → cognitive continuity, learning capture, preamble
- **Noesis → Obsidian**: projections — decisions, learning, state snapshots

## Confidence Mapping

| Graphify | Noesis | Stale (-0.10) |
|---|---|---|
| EXTRACTED | 1.00 | 1.00 |
| INFERRED 0.95 | 0.95 | 0.85 |
| INFERRED 0.85 | 0.85 | 0.75 |
| INFERRED 0.75 | 0.75 | 0.65 |
| INFERRED 0.65 | 0.65 | 0.55 |
| INFERRED 0.55 | 0.55 | 0.55 |
| AMBIGUOUS | 0.55 | Not promoted |

## Decision Matrix

| Proposed Feature | Owner |
|---|---|
| Execute tools, manage turns, coordinate agents? | OMP |
| Extract or query structural code knowledge? | Graphify |
| Shape beliefs, learning, cognitive continuity? | Noesis |
| Human reading/linking of exported knowledge? | Obsidian |

## Alignment Check

- OMP is the execution substrate
- Graphify is the required perception substrate
- Noesis is the cognitive substrate
- Obsidian is optional
- Removing Obsidian does not break runtime
- Removing Graphify degrades Noesis at its core
