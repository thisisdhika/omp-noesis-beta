# Memory Architectures — Full Research

> Source: Academic papers, framework documentation, and cognitive science (2025-2026)
> Compiled: 2026-06-12

---

## 1. CraniMem: Dual-Store Gated Memory

**Paper**: arxiv.org/pdf/2603.15642

CraniMem is a neurocognitively inspired memory architecture for long-horizon LLM agents. It introduces a gated, bounded, multi-stage memory with two distinct stores and a consolidation process.

### Dual-store design

- **Episodic buffer**: Fast, near-term memory for immediate context. Captures recent interactions in their original form.
- **Knowledge graph**: Structured, long-term memory for durable semantic recall. Stores distilled, structured knowledge that persists across sessions and tasks.

### Attentional gating

Inspired by brainstem/thalamic control. The attentional gate decides what information from the current interaction is worth encoding into the episodic buffer. This prevents noise and irrelevant details from consuming memory capacity.

### Systems consolidation

Periodically replays high-utility episodic traces into the knowledge graph, discarding low-utility items to bound growth. This mirrors the hippocampal consolidation process in biological memory.

### Retrieval path

At generation time, merges episodic evidence (short-term) with semantic recall from the knowledge graph (long-term) to form the context for the LLM.

### Benefits

- Improved robustness to distractions
- Better information stability than Vanilla RAG or Mem0 baselines
- Selective forgetting via importance weighting and temporal decay

---

## 2. MNEMA: Memory-Native Persistence

**Source**: zenodo.org/records/20010220

MNEMA introduces a memory-native cognitive architecture for persistent LLM agents.

### Memory as core persistence

Memory is not an add-on to the agent but the agent's primary persistence mechanism. The LLM is a reasoning engine that operates over the memory structure, not a stateful entity that maintains its own context.

### Episodic-semantic integration

Episodic memory (specific experiences) is integrated with semantic memory (general knowledge) in a unified structure. Episodic memories are tagged with temporal and contextual metadata, while semantic memories are distilled from episodic memories through a consolidation process.

### Persistent agent identity

By making memory the core persistence, MNEMA enables persistent agent identity across sessions. The agent's personality, knowledge, and learned behaviors are all stored in the memory structure, not in the LLM's context window.

---

## 3. DCPM: Dual-Process Cognitive Memory

**Paper**: arxiv.org/html/2606.09483v1

DCPM proposes a cognitive-capability hierarchy for long-term memory in self-evolving LLM agents.

### Memory as cognition

Memory should be treated as cognition rather than mere storage. The agent's memory system is responsible for understanding, not just remembering.

### Dual-process architecture

Inspired by Kahneman's System 1 and System 2 thinking:
- **System 1**: Fast, automatic memory operations (retrieval, association)
- **System 2**: Slow, deliberate memory operations (consolidation, reasoning about memories)

### Self-evolution

The agent's memory system learns from each interaction, refining its understanding of the world and improving its ability to retrieve relevant information. This creates a positive feedback loop where better memory leads to better reasoning, which leads to better memory.

---

## 4. ACC: Compressed Cognitive State

**Paper**: arxiv.org/pdf/2601.11653

The Agent Cognitive Compressor (ACC) replaces transcript replay with a bounded internal state updated online at each turn.

### Compressed Cognitive State (CCS)

CCS is the sole persistent internal representation across turns and directly conditions downstream reasoning, tool use, and actions. It is not a transcript or memory cache — it is a control-oriented, abstracted representation that preserves only decision-relevant information.

### Bounded memory

CCS discards irrelevant or low-utility detail to maintain a stable signal-to-noise ratio over long horizons. This prevents the common failure mode where agents accumulate irrelevant context that degrades performance over time.

### Schema-constrained compression

Uses a schema-constrained Cognitive Compressor Model (CCM) to generate a bounded, controlled internal state that encodes what changed, what matters, constraints, and goals.

---

## 5. MAGMA: Multi-Graph Memory

**Paper**: arxiv.org/pdf/2601.03236v1

MAGMA explicitly models heterogeneous relational structure within a unified but disentangled memory substrate.

### Four relational views

1. **Semantic**: Meaning-based relationships between concepts
2. **Temporal**: Time-based relationships between events
3. **Causal**: Cause-effect relationships between actions and outcomes
4. **Entity**: Entity-based relationships between objects and people

### Policy-guided retrieval

Retrieval is a policy-guided graph traversal over multiple relational views, enabling intent-aware selection, independent traversal of views, and fusion into a compact, type-aligned context for generation.

### Dual-stream evolution

Memory ingestion is decoupled from asynchronous structural consolidation, allowing low-latency updates and long-horizon reasoning.

---

## 6. Hierarchical Memory Theory

**Paper**: arxiv.org/pdf/2603.21564

A unifying theory for hierarchical memory in language agents.

### Three-operator decomposition

- **Extraction (α)**: Maps raw data into atomic units
- **Coarsening (C = (π, ρ))**: Partitions units and assigns relevance scores
- **Hierarchical organization**: Structures units into levels of abstraction

### Formal framework

Provides a formal framework for understanding how memory systems can be designed to balance detail and abstraction, enabling agents to reason at multiple levels of granularity.

---

## 7. Global Workspace Agents: Dual-Layer Memory

**Paper**: arxiv.org/pdf/2604.08206

GWA implements a dual-layer memory system:

### Short-Term Working Memory (STM)

- Token capacity threshold
- Contextual compression mechanism
- Holds the most recent and relevant information

### Semantic Memory

- Distilled knowledge from past interactions
- Maintains cognitive continuity without disrupting trajectory

### Cognitive Tick

Each tick represents one cycle of perception, reasoning, and action. The memory system is updated at each tick.

---

## 8. AutoAgent: Elastic Memory Orchestrator

**Paper**: arxiv.org/pdf/2603.09716

AutoAgent's Elastic Memory Orchestrator acts as the Experience Manager.

### Functions

- Compresses and structures interaction histories into concise episodic memories
- Filters redundancies
- Retrieves task-relevant context to reduce token load and accelerate reasoning

### Cognitive Evolution Module

Performs meta-cognitive analysis on curated experiences to identify gaps between intent and outcomes. Issues precise, text-based updates to the Memory Orchestrator strategies.

---

## 9. MUSE-Autoskill: Multi-Level Memory

**Paper**: arxiv.org/abs/2605.27366

MUSE-Autoskill implements multi-level memory:

### Three levels

1. **Short-term memory**: Current session context
2. **Long-term memory**: Cross-session knowledge
3. **Per-skill memory**: Experience accumulated across tasks for each skill

### Skill-level memory

Each skill has its own memory — what worked, what failed, what gotchas exist. This creates a per-skill learning loop.

---

## 10. Context Engineering Handbook: Memory Patterns

**Source**: github.com/ypollak2/context-engineering-handbook

### Memory patterns

- **Filesystem-as-Memory**: Durable, inspectable knowledge storage
- **Semantic Memory Indexing**: Vector-based retrieval
- **Cross-Session Sync**: Maintain continuity across interactions

### Four-tier memory architecture

1. **Working memory**: Current context window
2. **Short-term memory**: Recent conversation history
3. **Long-term memory**: Cross-session knowledge
4. **Episodic memory**: Specific experiences and their outcomes

---

## 11. Agent Memory Techniques

**Source**: github.com/Wern-wq/Agent_Memory_Techniques

Catalogs 30 memory techniques for LLM-based agents, organized into six families:

1. **Short-term context management**: Window sliding, summarization, compression
2. **Long-term storage**: File-based, database-backed, vector-indexed
3. **Cognitive architectures**: Dual-store, gated, hierarchical
4. **Retrieval-augmented generation**: RAG, hybrid search, semantic indexing
5. **Memory consolidation**: Episodic-to-semantic, importance weighting, temporal decay
6. **Cross-session persistence**: Handoff, session linking, global state

---

## 12. Mate Agent Memory Skills (MAM)

**Source**: github.com/matevip/mate-agent-memory-skills

MAM provides persistent, lifecycle-aware memory for AI coding agents across sessions and tools.

### Lifecycle stages

1. **Extract** (mem-extract): Pull atomic, attributable claims; redact secrets
2. **Consolidate** (mem-consolidate): Merge near-duplicates, flag direct conflicts to contradictions.md
3. **Recall** (mem-recall): Fast surface of relevant memories with optional LLM re-ranking
4. **Dream** (Phase 1, mem-dream, mem-contradiction, mem-nudge, mem-soul): Idle maintenance, decay of stale data, long-term user profile

### Design constraints

Single-user, single-machine, file-based, agent-agnostic memory that works across different agents via per-agent configurations or symlinks.

---

## 13. fcontext: Persistent Cross-Agent Memory

**Source**: github.com/lijma/agent-skill-fcontext

fcontext is a system for persistent, cross-session and cross-agent memory for AI coding agents.

### Goals

- Prevent forgetting between sessions
- Maintain shared team knowledge
- Enable agents to switch contexts without losing state

---

## Memory Architecture Patterns for Noesis

Based on all the research, here are the memory architecture patterns that apply to noesis:

### 1. Dual-store (CraniMem)

- **Episodic buffer**: Current session state (attention, recent beliefs, active workflow)
- **Knowledge graph**: Durable semantic state (established beliefs, decisions, learning)

The `session.compacting` hook is the consolidation boundary — episodic state is compressed into semantic state at compaction.

### 2. Bounded state (ACC)

The 2000-token preamble budget is the constraint. Learning entries, beliefs, and inferences must all have eviction policies:
- Learning entries: oldest-first eviction
- Beliefs: low-confidence eviction first
- Inferences: resolved hypotheses eviction first
- Never evict: active workflow, active decisions

### 3. Progressive disclosure (Context Engineering Handbook)

Three tiers of memory:
1. **Index**: Attention layer (what the agent is focused on) — always loaded
2. **Load**: Belief layer (what it knows) — loaded on demand
3. **Runtime**: Learning layer (what it has learned) — loaded only when relevant

### 4. Filesystem-backed persistence (LangChain Deep Agents)

`.omp/noesis/state.json` is the filesystem-backed persistence. It survives compaction, session switches, and even process restarts.

### 5. Per-skill memory (MUSE-Autoskill)

Each noesis skill should have its own memory — what worked, what failed, what gotchas exist. This is stored in the learning layer with skill-specific metadata.

### 6. Consolidation at compaction (CraniMem)

The `session.compacting` hook triggers consolidation:
- Active beliefs (confidence ≥ 0.5) survive compaction
- Low-confidence beliefs (confidence < 0.5) are evicted
- Active workflow survives compaction
- Resolved hypotheses are evicted
- Unresolved hypotheses survive compaction

### 7. Attentional gating (CraniMem)

Not every tool result deserves a belief. The `tool_result` hook should filter for significant events only:
- Test failures → always capture
- Build failures → always capture
- Test passes → capture if significant
- Other tool results → ignore

### 8. Semantic equivalence (Epica)

When the same information is expressed differently, treat it as equivalent. This prevents unnecessary belief updates and reduces noise in the belief layer.

### 9. Provenance tracing (XTrace)

Every belief should have a provenance chain showing:
- Where it came from (source)
- When it was created (timestamp)
- What caused it to be updated (revision reason)
- What it replaced (supersedes)

### 10. Multi-relational graph (MAGMA)

When integrated with Graphify, noesis can leverage multiple relational views:
- **Semantic**: Meaning-based relationships (what the code does)
- **Temporal**: Time-based relationships (when things changed)
- **Causal**: Cause-effect relationships (what caused what)
- **Entity**: Entity-based relationships (who/what is connected)
