# omp-noesis: Alignment Brief

> Version: 1.0
> Author: Dhika Putra Ardana
> Date: 2026-06-12
> Status: Aligned

---

## 1. Purpose

This document is the single source of truth for **what omp-noesis is, what it is not, and why it matters**.

It is not a full product spec.
It is the reference that every other noesis doc — boundary matrix, context model, cognitive state model, belief model, integration contracts — must remain consistent with.

---

## 2. Core Thesis

**omp-noesis exists to fill the cognitive gaps in Oh My Pi, not to replace Oh My Pi.**

OMP already provides the execution harness: tools, hooks, skills, compaction machinery, subagents, and orchestration.

Noesis should not rebuild any of that.

Noesis should add the missing cognitive layer:
- structured cognitive state
- compaction survival for that state
- belief revision with contradiction handling
- persistent learning from execution
- graph-grounded perception via Graphify
- workflow as a durable cognitive artifact
- smart-zone-aware context management that keeps the agent in its effective reasoning zone

This matters because **context is the real bottleneck**.

> **Not bigger models. Not more tokens. Better context architecture.**

Noesis should treat tokens as a scarce cognitive budget, not an infinite buffer.
The goal is not to maximize how much context the agent can hold.
The goal is to maximize how much high-signal context the agent can use well.

In one sentence:

> **OMP gives agent execution. Noesis gives agent continuity and context discipline.**

---

## 3. The Product Boundary

### 3.1 What noesis is

Noesis is an **OMP-native cognitive substrate**.

It makes the agent's working cognition first-class, structured, durable, and inspectable.

It should help the agent:
- keep active beliefs across compaction
- update beliefs when contradicted (AGM belief revision)
- learn from failures instead of repeating them
- ground claims in a live code graph (Graphify)
- project its workflow into a reviewable artifact
- stay effective under context pressure instead of degrading into transcript sprawl

### 3.2 What noesis is not

Noesis is **not**:
- a new agent runtime
- a new orchestrator
- a replacement for OMP swarm/subagents
- a generic memory database competing with Mnemopi or Hindsight
- a new graph engine
- a new editor or vault product
- a workflow DSL or workflow executor
- a replacement for the stale `noesis-flow` YAML workflow engine concept

If OMP already does it, noesis should integrate with it.
If Graphify already does it, noesis should consume it.
If Obsidian already does it, noesis should project into it.

---

## 4. The Four-System Stack

The product depends on exactly four systems with clear ownership.

| System | Role | Dependency |
|---|---|---|
| **Oh My Pi (OMP)** | Execution substrate | Required (platform) |
| **Graphify** | Perception substrate | Required (core dependency) |
| **Noesis** | Cognitive substrate | This product |
| **Obsidian** | Reflection substrate | Optional (highly recommended) |

### 4.1 Graphify is required

Graphify is a core dependency.
Noesis cannot claim graph-grounded cognition without it.

Graphify provides:
- codebase knowledge graph from 20+ languages via tree-sitter
- Leiden community detection for architectural domains
- confidence-bearing edge labels: EXTRACTED (1.0), INFERRED ({0.55, 0.65, 0.75, 0.85, 0.95}), AMBIGUOUS
- CLI: `graphify query`, `graphify update .`, `graphify pi install`
- MCP server for programmatic graph access (`query_graph`, `get_node`, `shortest_path`)
- incremental updates (no full rebuilds)
- Obsidian export via `--obsidian` flag
- 65k+ GitHub stars, MIT license, active development

Hard rule:

> **If Graphify disappears, noesis is degraded at its core.**

### 4.2 Obsidian is optional

Obsidian is highly recommended but not runtime-critical.

Obsidian provides:
- local-first Markdown vault for human review
- backlinks and graph browsing
- manual curation and knowledge gardening
- optional team-readable cognition surfaces

Hard rule:

> **If Obsidian disappears, noesis still works.**

---

## 5. Source-of-Truth Stack

### OMP owns
- tool registration and execution
- hook lifecycle (20+ events including `session.compacting`)
- session lifecycle and compaction pipeline
- subagents, orchestration (`orchestrate` v15.6.0, `@oh-my-pi/swarm-extension`)
- skills loading and routing
- existing memory surfaces (Mnemopi, Hindsight)

### Graphify owns
- code graph construction (detect → extract → build → cluster → analyze → report)
- graph querying and traversal
- relation confidence and provenance
- community detection and architectural insight
- graph artifact persistence (`graphify-out/graph.json`)

### Noesis owns
- cognitive state (attention / belief / inference / commitment / learning)
- belief revision with AGM-compliant contradiction handling
- learning from execution (tool_result → root cause → fix → apply)
- compaction survival of structured state
- smart-zone-aware context discipline
- workflow artifact projection
- translation of Graphify evidence into cognitive state
- cognitive preamble construction and injection

### Obsidian owns
- optional human-readable projection
- optional browsing, linking, and curation
- optional reflection space outside runtime-critical execution

---

## 6. The Real OMP Gaps Noesis Must Fill

| Gap | OMP has | Noesis adds |
|---|---|---|
| **1. Compaction loses cognitive structure** | Transcript summarization, `preserveData` field | Structured cognitive state that survives as typed data |
| **2. Tool execution does not become learning** | `tool_result` hook | Failure → root cause → fix → future avoidance loop |
| **3. Workflows are not cognitive artifacts** | `orchestrate`, swarm, `todo` | Durable, reviewable workflow enriched with beliefs, decisions, learning |
| **4. Graph knowledge is idle** | No graph integration | Graphify as perception layer feeding into belief system |
| **5. Skills are context-blind** | Skill loading, `skill://` URLs | Skills inherit active beliefs, decisions, learning |
| **6. Contradictions are not managed** | No belief system | AGM-compliant belief revision with supersession audit trail |
| **7. Context pressure degrades quality** | Compaction pipeline | Dedicated cognitive layer protecting the smart zone |

---

## 7. The Context Bottleneck

> **Context is the single bottleneck of agentic engineering.**

The bottleneck is not nominal context-window size.
It is the combination of finite attention, context degradation as sessions bloat, loss of state during compaction, poor signal-to-noise ratio, and weak retrieval of the right facts at the right moment.

Current field practice converges on the same point:
- Anthropic: context engineering is finding the smallest possible set of high-signal tokens
- Matt Pocock: the smart zone degrades around 100k-150k tokens, long before the hard limit
- CWL paper: ~80k token ceiling preserves quality at ~30% of model window
- State of the art: compaction + memory + subagent isolation, working together

Noesis is not merely memory.
It is a **context architecture** whose job is to preserve agent quality over time.

---

## 8. Smart Zone and Memento Discipline

### 8.1 Smart zone

Noesis should help the agent stay inside a high-quality working zone by:
- keeping active context bounded and high-signal
- preferring graph-grounded retrieval over blind transcript growth
- projecting only the highest-signal cognitive state back into context
- externalizing durable state instead of inlining everything
- triggering proactive compaction before quality visibly degrades (~160k tokens, 80% of OMP's default idle threshold)

### 8.2 Memento discipline

Noesis should treat fresh starts as normal, not exceptional.
What must survive is not the whole transcript.
What must survive is the **right structured state**:
- active beliefs ≥ 0.75 confidence
- active decisions
- live workflow commitment
- unresolved hypotheses
- meaningful learning (ranked by recency × relevance × failure × resolved-fix)
- minimal focus orientation

> **Noesis should preserve cognition, not preserve clutter.**

---

## 9. Token Efficiency as a Product Principle

Token efficiency is part of product identity, not a performance optimization.

Noesis should optimize for:
- fewer irrelevant tokens in active context
- graph-guided retrieval before file reading
- bounded cognitive preambles (≤2000 tokens)
- selective compaction survivors (capped per category)
- durable externalized state instead of repeated transcript replay

The product should become stronger when context pressure rises, not collapse into transcript sprawl.

---

## 10. World-First Ambition

The ambition is to become a **world-first cognitive layer for agentic engineering**.

### What makes it world-first

No existing system — not Claude Code, not Cursor, not Windsurf, not any OMP extension — combines all of the following in a single coherent cognitive substrate:

1. **Graph-grounded beliefs**: agent beliefs derived from live code graph, not only transcript
2. **Structured cognitive state**: typed, versioned, five-layer state (attention / belief / inference / commitment / learning)
3. **AGM belief revision**: formal supersession with audit trail when beliefs are contradicted
4. **Compaction survival**: structured state survives OMP compaction via `session.compacting` hook + `preserveData`
5. **Persistent learning from execution**: `tool_result` hook captures failures → agent records root cause + fix → preamble surfaces it next session
6. **Workflow as cognitive artifact**: living Markdown document with plan + beliefs + decisions + learning
7. **Smart-zone-aware context discipline**: proactive compaction, bounded preamble, retrieval-before-read

### What makes it defensible

- 65k+ star, MIT-licensed perception substrate (Graphify)
- AGM K*2–K*6 formal belief revision (grounded in Kumiho and Epica research)
- OMP-native: zero core modifications, four hooks, four tools
- Runs without cloud dependencies; state is a git-commit-able file

---

## 11. First-Principles Product Rules

1. **Do not reinvent OMP.**
2. **Do not replace Graphify.**
3. **Do not make Obsidian runtime-critical.**
4. **Keep runtime cognition structured and minimal.**
5. **Every major feature must strengthen continuity and token efficiency, not spectacle.**
6. **A feature that belongs to orchestration should stay in OMP.**
7. **A feature that belongs to cognition should live in noesis.**
8. **Preserve the smallest high-signal state that keeps the agent in the smart zone.**
9. **Externalize durable state instead of bloating live context.**
10. **Prefer structure over prose when preserving cognition.**

---

## 12. Product Architecture

Noesis consists of five layers, not as separate modules but as concerns within the cognitive system.

### 12.1 Perception layer
Consumes Graphify findings and converts them into beliefs with confidence scores, provenance, and architectural context.

Key contract: Graphify output (nodes, edges, confidence, communities) → noesis beliefs (facts, confidence, source, community scope).

### 12.2 Cognition layer
Stores active attention, beliefs, inferences, commitments, and learning in a typed, versioned, JSON-backed structure at `.omp/noesis/state.json`.

Key contract: structured state that survives compaction and session boundaries.

### 12.3 Continuity layer
Injects cognitive state via four OMP hooks:
- `context` → cognitive preamble injection every LLM call
- `session.compacting` → survivor set + `preserveData` injection
- `tool_result` → failure capture and learning candidates
- `before_agent_start` → safety-net preamble injection

### 12.4 Context management layer
Keeps active context bounded, high-signal, and smart-zone-aware through:
- ≤2000-token preamble with trim priority
- survivor set with per-category caps
- learning ranking (recency × relevance × failure × resolved-fix)
- proactive compaction at ~80% of OMP idle threshold
- retrieval-before-read policy (Graphify first, files second)

### 12.5 Projection layer
Renders the meaningful parts of cognition into durable artifacts:
- workflow Markdown document (plan + beliefs + decisions + learning)
- optional Obsidian vault projection (decisions, learning, workflow)
- `.omp/noesis/state.json` as a diffable, commit-able artifact

---

## 13. Resolved Design Decisions

These decisions were open in earlier drafts and have now been resolved with evidence.

| Question | Decision | Source |
|---|---|---|
| Belief confidence threshold for live exposure | ≥ 0.75 | Graphify forced-rank INFERRED scores |
| Default survivor set shape | Focus (2s), workflow (3), decisions (5), beliefs (10), hypotheses (3), learning (3), learning counters (always), pointer (1) | CWL, Anthropic, OMP hook contract |
| Learning ranking formula | recency × task_relevance × failure_multiplier × resolved_fix_multiplier | Perplexity gotchas, Anthropic |
| Graphify signal → noesis mapping | God nodes→attention, community→domain scope, path distance→decay, edge confidence→belief confidence | Graphify CLI, graphify-mcp-tools |
| Stale-state markers | Belief/decision: `active`/`superseded`/`archived`, hypothesis: `testing`/`confirmed`/`refuted`/`abandoned`, workflow: `draft`/`active`/`done`/`abandoned`, step: `pending`/`active`/`done`/`skipped` | AGM, Kumiho |
| Preamble token budget | ≤2000 tokens, with trim order | OMP `reserveTokens`=16384, `keepRecentTokens`=20000, CWL ~80k window |
| Proactive compaction vs reset | Proactive preferred; reset + reload as fallback | OMP `idleThresholdTokens`=200000, Syrin 60% trigger |

Full details in `docs/context-management-model.md`.

---

## 14. Current Alignment Statement

The project is aligned on the following:

- Noesis is an OMP-native extension layer.
- Noesis must not rebuild orchestration or workflow execution.
- Graphify is required; Obsidian is optional.
- The product focus is cognition, context management, continuity, learning, and grounded perception.
- The goal is a world-first cognitive substrate for agentic engineering.
- Token efficiency and smart-zone preservation are core behaviors.
- Stale concepts (`noesis-flow` YAML DSL, `noesis-core` Smart Zone manager) are rejected.

---

## 15. Document Map

| Document | Purpose |
|---|---|
| `docs/PRD.md` (this file) | Thesis, boundaries, dependencies, gaps, world-first claim |
| `docs/boundary-matrix.md` | Who owns what, anti-duplication rules, translation contracts |
| `docs/context-management-model.md` | Smart zone, compaction, preamble, survivor policy, resolved decisions |
| `docs/cognitive-state-schema.md` | Exact shape of `.omp/noesis/state.json` |
| `docs/belief-revision-model.md` | AGM belief revision, supersession, two-tier, audit trail |
| `docs/graphify-integration-contract.md` | CLI surface, evidence pipeline, confidence mapping |
| `docs/cognitive-enrichment-contract.md` | How noesis enriches OMP plans with cognition |

Future:
- Obsidian projection contract

---
## 16. References

Internal grounding:
- `docs/boundary-matrix.md`
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
- Matt Pocock, Smart zone: https://raw.githubusercontent.com/mattpocock/dictionary-of-ai-coding/main/dictionary/Smart%20zone.md
- Matt Pocock, Memory system: https://raw.githubusercontent.com/mattpocock/dictionary-of-ai-coding/main/dictionary/Memory%20system.md
- OMP compaction docs: https://github.com/can1357/oh-my-pi/blob/main/docs/compaction.md
- OMP hooks docs: https://github.com/can1357/oh-my-pi/blob/main/docs/hooks.md
- Syrin context compaction: https://docs.syrin.dev/agent-kit/core/context-compaction
