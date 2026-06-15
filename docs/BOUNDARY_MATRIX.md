# omp-noesis: Boundary Matrix

> **Version:** 0.1.0  
> **Date:** 2026-06-15  
> **Status:** Finalized

## 1. Governing Rule

> **Noesis must fill the cognitive gaps around OMP, not reimplement OMP itself.**

## 2. System Roles

| System | Role | Dependency | Runtime-Critical |
|---|---|---|---|
| **OMP** | Execution substrate | Required (platform) | Yes |
| **Graphify** | Perception substrate | Required (core dep) | Yes |
| **Noesis** | Cognitive substrate | This product | Yes |
| **Obsidian** | Reflection substrate | Optional | No |

## 3. Context Ownership

### OMP owns runtime context plumbing
- Turns and message history
- Tool execution and results
- Hook insertion points
- Compaction lifecycle
- Subagent context isolation

### Graphify owns retrieval-grade structural context
- Codebase knowledge graph
- Graph queries via CLI
- Incremental updates
- Leiden community detection
- Confidence-bearing edges

### Noesis owns cognitive context quality
- What structured state deserves live exposure
- Smart-zone protection (≤2000 tokens)
- Graphify evidence → beliefs translation
- Compaction survival (survivor set + preserveData)
- Learning ranking for preamble inclusion

### Obsidian owns optional human-facing context
- Inspection, curation, external reflection
- Not runtime-critical
- Removing it → no runtime degradation

## 4. Source-of-Truth Matrix

| Concern | Owner |
|---|---|
| Tool execution | **OMP** |
| Agent/subagent orchestration | **OMP** |
| Skill loading and routing | **OMP** |
| Compaction pipeline | **OMP** |
| Long-term general memory | **OMP / Mnemopi / Hindsight** |
| Code graph construction | **Graphify** |
| Graph query semantics | **Graphify** |
| Structural evidence | **Graphify** |
| Smart-zone protection | **Noesis** |
| Cognitive state | **Noesis** |
| Beliefs and decisions | **Noesis** |
| Belief revision | **Noesis** |
| Learning from execution | **Noesis** |
| Workflow artifact | **Noesis** |
| Human-readable projection | **Obsidian** |

## 5. Hard Ownership Rules

### Rule 1: OMP remains the runtime authority
If something must happen for an agent turn, tool call, compaction event, or orchestration step — OMP owns it.

### Rule 2: Graphify remains the graph authority
If something requires building, updating, querying, clustering, or structurally explaining the code graph — Graphify owns it.

### Rule 3: Noesis remains the cognition authority
If something changes what the agent believes, remembers in working form, learns from execution, protects the smart zone, or projects as cognitive workflow — Noesis owns it.

### Rule 4: Obsidian never becomes runtime-critical
If removing Obsidian would break the runtime behavior of Noesis — the boundary has been violated.

## 6. What Must Never Be Duplicated

### Noesis must not duplicate OMP
No separate orchestration engine, agent runtime, compaction engine, skill system, or general agent memory.

### Noesis must not duplicate Graphify
No graph extractor, graph store, graph query language, community detector, or parallel code-structure indexing pipeline.

### Noesis must not duplicate Obsidian
No custom note editor, vault UI, human backlink engine, or knowledge-base product.

## 7. Translation Contracts

### Graphify → Noesis
Translate graph findings, relation confidence, source provenance, community signals, and relevance cues into beliefs, confidence scores, evidence provenance, attention hints, workflow relevance, and smarter context selection.

### OMP → Noesis
Consume context hook, compaction hook, tool result events, and before-agent-start injection to maintain cognitive continuity, learning capture, cognitive preamble, durable workflow projection, and bounded high-signal context.

### Noesis → Obsidian
Project optionally: decisions, workflow documents, learning records, state snapshots. Never make runtime depend on these projections.

## 8. Confidence Translation Contract

| Graphify confidence | Noesis belief confidence | Behavior |
|---|---|---|
| EXTRACTED | **1.0** | Always live, always in preamble |
| INFERRED 0.95 | **0.95** | Live, preamble-eligible |
| INFERRED 0.85 | **0.85** | Live, preamble-eligible |
| INFERRED 0.75 | **0.75** | Live, preamble-eligible (threshold) |
| INFERRED 0.65 | **0.65** | Stored, surfaced only when task-relevant |
| INFERRED 0.55 | **0.55** | Stored, surfaced only when task-relevant |
| AMBIGUOUS | **never promoted** | Not converted to belief |

## 9. Decision Matrix

| Proposed Feature | Owner |
|---|---|
| Does it execute tools, manage turns, or coordinate agents? | **OMP** |
| Does it extract or query structural code knowledge? | **Graphify** |
| Does it shape beliefs, learning, continuity, workflow cognition, or smart-zone protection? | **Noesis** |
| Does it improve human reading, linking, or curation of exported knowledge? | **Obsidian** |

## 10. Alignment Check

A design stays aligned only if all statements remain true:

- OMP is the execution substrate.
- Graphify is the required perception substrate.
- Noesis is the cognitive substrate.
- Obsidian is optional.
- Removing Obsidian does not break runtime behavior.
- Removing Graphify weakens core cognition and context selection.
- Noesis adds continuity and smart-zone discipline, not platform sprawl.
