# omp-noesis: Boundary Matrix

> Version: 1.0
> Date: 2026-06-12
> Status: Aligned

---

## 1. Purpose

This document defines the exact boundaries between Oh My Pi (OMP), Graphify, Noesis, and Obsidian.

Its purpose is to prevent duplication, avoid architectural drift, and keep every design decision aligned with the product thesis.

If a question starts with "should noesis own…", this document should answer it.

---

## 2. The Governing Rule

> **Noesis must fill the cognitive gaps around OMP, not reimplement OMP itself.**

And:

> **Graphify is the required perception substrate. Obsidian is an optional reflection surface.**

If a feature belongs to execution, orchestration, or base harness lifecycle → **OMP**.
If a feature belongs to graph extraction, querying, or structural evidence → **Graphify**.
If a feature belongs to beliefs, learning, continuity, cognitive context quality → **Noesis**.
If a feature belongs to human browsing, linking, curation → **Obsidian**.

---

## 3. System Roles

| System | Role | Dependency | Runtime-critical |
|---|---|---|---|
| **OMP** | Execution substrate | Required (platform) | Yes |
| **Graphify** | Perception substrate | Required (core dep) | Yes |
| **Noesis** | Cognitive substrate | This product | Yes |
| **Obsidian** | Reflection substrate | Optional (recommended) | No |

---

## 4. Context Ownership

The context problem is owned across systems, not by any single one.

### OMP owns runtime context plumbing
- turns and message history
- tool execution and results
- hook insertion points (`context`, `session.compacting`, `tool_result`, `before_agent_start`)
- compaction lifecycle (trigger, summarization, rebuild)
- subagent context isolation

### Graphify owns retrieval-grade structural context
- codebase knowledge graph (`graphify-out/graph.json`)
- graph queries via CLI: `graphify query "…" --graph graphify-out/graph.json`
- incremental updates: `graphify update .`
- Leiden community detection and god-node ranking
- confidence-bearing edges: EXTRACTED (1.0), INFERRED ({0.55…0.95}), AMBIGUOUS
- MCP server: `query_graph`, `get_node`, `shortest_path`
- integration install: `graphify pi install`

### Noesis owns cognitive context quality
- deciding what structured state deserves live exposure
- protecting the agent's smart zone with bounded preamble (≤2000 tokens)
- translating Graphify evidence into beliefs with confidence mapping
- carrying cognition across compaction (survivor set + `preserveData`)
- ranking learning for preamble inclusion

### Obsidian owns optional human-facing context
- inspection, curation, external reflection
- does not own runtime context quality
- removed → no runtime degradation

---

## 5. Source-of-Truth Matrix

| Concern | Owner | OMP detail |
|---|---|---|
| Tool execution | **OMP** | `pi.registerTool`, `pi.on("tool_call")`, `pi.on("tool_result")` |
| Agent/subagent orchestration | **OMP** | `orchestrate` keyword (v15.6.0), `@oh-my-pi/swarm-extension`, task subagents |
| Skill loading and routing | **OMP** | Provider precedence (native/omp-plugins/claude/…), `skill://` URLs |
| Compaction pipeline | **OMP** | `session.compacting` hook, `CompactionEntry` with `preserveData` |
| Long-term general memory | **OMP / Mnemopi / Hindsight** | `recall`, `reflect`, `retain`, `memory_edit` |
| Code graph construction | **Graphify** | `graphify .`, detect→extract→build→cluster pipeline |
| Graph query semantics | **Graphify** | `graphify query`, `graphify path`, `graphify explain` |
| Structural evidence | **Graphify** | Edge confidence + source provenance |
| Smart-zone protection | **Noesis** | Cognitive context quality, not runtime or graph concern |
| Cognitive state | **Noesis** | `.omp/noesis/state.json`, 5-layer typed state |
| Beliefs and decisions | **Noesis** | Facts with confidence, decisions with rationale |
| Belief revision | **Noesis** | AGM supersession with audit trail (`supersededBy`) |
| Learning from execution | **Noesis** | `tool_result` → learning candidate → root cause → fix → preamble |
| Workflow artifact | **Noesis** | Living Markdown from commitment layer |
| Human-readable projection | **Obsidian** | Optional; not runtime-critical |

---

## 6. Capability Boundaries

### 6.1 OMP owns execution

OMP is responsible for tool registration/execution, hook lifecycle, session lifecycle, subagents/orchestration, compaction machinery, skill loading, and existing memory infrastructure.

Noesis uses these surfaces through five hooks (`context`, `session.compacting`, `tool_result`, `before_agent_start`, `turn_end`) and four registered tools (`noesis_attend`, `noesis_believe`, `noesis_infer`, `noesis_commit`).

OMP settings noesis depends on:
- `compaction.reserveTokens` = 16384
- `compaction.keepRecentTokens` = 20000
- `compaction.idleThresholdTokens` = 200000
- `compaction.strategy` = `"context-full"`
- `compaction.autoContinue` = true

### 6.2 Graphify owns perception

Graphify is responsible for turning repos into graphs, maintaining artifacts, answering queries, exposing structural relations with confidence, and optionally exporting views.

Key CLI commands noesis depends on:
- `graphify query "…" --graph graphify-out/graph.json` — belief evidence
- `graphify update .` — incremental graph refresh
- `graphify --version` — availability check
- `graphify pi install` — OMP integration install

Key data model:
- `graphify-out/graph.json` — the graph artifact
- Edge confidence: EXTRACTED (1.0), INFERRED ({0.55, 0.65, 0.75, 0.85, 0.95}), AMBIGUOUS
- Nodes with `community` attribute from Leiden clustering

Noesis consumes Graphify outputs; it never builds or queries the graph independently.

### 6.3 Noesis owns cognition and context discipline

Noesis is responsible for attention, beliefs, decisions, inference tracking, learning entries, workflow commitment/projection, continuity across compaction, provenance-aware evidence-to-belief translation, and smart-zone protection.

Noesis must not become a graph engine, orchestrator, or workflow executor.

### 6.4 Obsidian owns optional reflection

Obsidian is responsible for reading/browsing projected notes, backlinks, manual curation, and optional team-readable documentation.

It must never be a runtime dependency for correctness.

---

## 7. Hard Ownership Rules

### Rule 1: OMP remains the runtime authority
If something must happen for an agent turn, tool call, compaction event, or orchestration step — OMP owns it.

### Rule 2: Graphify remains the graph authority
If something requires building, updating, querying, clustering, or structurally explaining the code graph — Graphify owns it.

### Rule 3: Noesis remains the cognition authority
If something changes what the agent believes, remembers in working form, learns from execution, protects the smart zone, or projects as cognitive workflow — Noesis owns it.

### Rule 4: Obsidian never becomes runtime-critical
If removing Obsidian would break the runtime behavior of Noesis — the boundary has been violated.

---

## 8. Confidence Translation Contract

This is the exact mapping from Graphify evidence to noesis belief confidence.

| Graphify confidence | Noesis belief confidence | Behavior |
|---|---|---|
| EXTRACTED | **1.0** | Always live, always in preamble |
| INFERRED 0.95 | **0.95** | Live, preamble-eligible |
| INFERRED 0.85 | **0.85** | Live, preamble-eligible |
| INFERRED 0.75 | **0.75** | Live, preamble-eligible (threshold) |
| INFERRED 0.65 | **0.65** | Stored, surfaced only when task-relevant |
| INFERRED 0.55 | **0.55** | Stored, surfaced only when task-relevant |
| AMBIGUOUS | **never promoted** | Not converted to belief |

---

## 9. What Must Never Be Duplicated

### Noesis must not duplicate OMP
No separate orchestration engine, agent runtime, compaction engine, skill system, or general agent memory.

### Noesis must not duplicate Graphify
No graph extractor, graph store, graph query language, community detector, or parallel code-structure indexing pipeline.

### Noesis must not duplicate Obsidian
No custom note editor, vault UI, human backlink engine, or knowledge-base product.

---

## 10. Translation Contracts

Noesis exists as a translation layer between systems that already do their own jobs well.

### 10.1 Graphify → Noesis
Translate graph findings, relation confidence, source provenance, community signals, and relevance cues into beliefs, confidence scores, evidence provenance, attention hints, workflow relevance, and smarter context selection.

### 10.2 OMP → Noesis
Consume context hook, compaction hook, tool result events, and before-agent-start injection to maintain cognitive continuity, learning capture, cognitive preamble, durable workflow projection, and bounded high-signal context.

### 10.3 Noesis → Obsidian
Project optionally: decisions, workflow documents, learning records, state snapshots. Never make runtime depend on these projections.

---

## 11. Decision Matrix

Use this before accepting any new feature.

| Proposed feature | Owner |
|---|---|
| Does it execute tools, manage turns, or coordinate agents? | **OMP** |
| Does it extract or query structural code knowledge? | **Graphify** |
| Does it shape beliefs, learning, continuity, workflow cognition, or smart-zone protection? | **Noesis** |
| Does it improve human reading, linking, or curation of exported knowledge? | **Obsidian** |

If a feature spans more than one system, Noesis should prefer composition over absorption.

---

## 12. Alignment Check

A design stays aligned only if all statements remain true:

- OMP is the execution substrate.
- Graphify is the required perception substrate.
- Noesis is the cognitive substrate.
- Obsidian is optional.
- Removing Obsidian does not break runtime behavior.
- Removing Graphify weakens core cognition and context selection.
- Noesis adds continuity and smart-zone discipline, not platform sprawl.

---

## 13. References

Internal grounding:
- `docs/PRD.md`
- `docs/context-management-model.md`
- `docs/stale/omp-noesis-strategic-blueprint.md`
- `docs/research/04-graphify-labs.md`
- `docs/research/05-omp-platform.md`
- `docs/research/08-belief-revision.md`
- `docs/research/11-synthesis.md`

External grounding:
- Anthropic, Effective context engineering: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Beyond Compaction (CWL): https://arxiv.org/html/2606.11213v1
- Graphify Labs: https://graphifylabs.ai/
- Graphify repository: https://github.com/safishamsi/graphify
- Graphify forced-rank confidence (PR #546): https://github.com/safishamsi/graphify/pull/546
- Graphify how-it-works (v8): https://github.com/safishamsi/graphify/blob/v8/docs/how-it-works.md
- Matt Pocock, Smart zone: https://raw.githubusercontent.com/mattpocock/dictionary-of-ai-coding/main/dictionary/Smart%20zone.md
- Matt Pocock, Memory system: https://raw.githubusercontent.com/mattpocock/dictionary-of-ai-coding/main/dictionary/Memory%20system.md
- OMP compaction docs: https://github.com/can1357/oh-my-pi/blob/main/docs/compaction.md
- OMP hooks docs: https://github.com/can1357/oh-my-pi/blob/main/docs/hooks.md
- OMP session docs: https://github.com/can1357/oh-my-pi/blob/main/docs/session.md
- Syrin context compaction: https://docs.syrin.dev/agent-kit/core/context-compaction
