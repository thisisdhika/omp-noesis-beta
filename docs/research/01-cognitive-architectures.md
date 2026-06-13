# Cognitive Architectures for AI Agents — Full Research

> Source: Academic papers, industry research, and framework documentation (2025-2026)
> Compiled: 2026-06-12

---

## 1. CraniMem: Cranial Inspired Gated and Bounded Memory for Agentic Systems

**Paper**: arxiv.org/pdf/2603.15642

CraniMem is a neurocognitively inspired memory architecture for long-horizon LLM agents. It introduces a gated, bounded, multi-stage memory with two distinct stores and a consolidation process.

### Dual-store design

CraniMem uses a fast episodic buffer for near-term continuity and a structured long-term knowledge graph for durable semantic recall. The episodic buffer captures recent interactions in their original form, providing immediate context for the agent's current task. The knowledge graph stores distilled, structured knowledge that persists across sessions and tasks.

### Attentional gating

CraniMem implements selective encoding inspired by brainstem/thalamic control. The attentional gate decides what information from the current interaction is worth encoding into the episodic buffer. This prevents noise and irrelevant details from consuming memory capacity. The gating mechanism is trained to recognize task-relevant signals and filter out distractions.

### Systems consolidation

CraniMem periodically replays high-utility episodic traces into the knowledge graph, discarding low-utility items to bound growth. This mirrors the hippocampal consolidation process in biological memory, where experiences are replayed during rest periods to strengthen important memories and prune unimportant ones. The consolidation process is triggered when the episodic buffer reaches capacity or when the agent enters a low-activity period.

### Retrieval path

At generation time, CraniMem merges episodic evidence (short-term) with semantic recall from the knowledge graph (long-term) to form the context for the LLM. The retrieval process uses both recency (from episodic buffer) and relevance (from knowledge graph) to assemble the most useful context for the current task.

### Benefits

On long-horizon benchmarks, CraniMem provides improved robustness to distractions and better information stability than Vanilla RAG or Mem0 baselines, with selective forgetting via importance weighting and temporal decay. The gated design prevents the common failure mode where agents accumulate irrelevant context that degrades performance over time.

---

## 2. Global Workspace Agents (GWA)

**Paper**: arxiv.org/pdf/2604.08206

The paper introduces Global Workspace Agents (GWA), a cognitive architecture that reimagines multi-agent LLM coordination as an active, event-driven discrete dynamical system rather than passive, memory-driven data sharing.

### Central broadcast hub

GWA replaces static memory pools with a central broadcast hub and a heterogeneous swarm of constrained agents to enable continuous cognitive cycles and sustained agency. The global workspace acts as a shared information space where specialized agents can broadcast their findings and receive updates from others.

### Entropy-based intrinsic drive

GWA implements an entropy-based intrinsic drive to regulate generation temperature and autonomously break reasoning deadlocks, promoting semantic diversity. When the agent's reasoning becomes too homogeneous (low entropy), the intrinsic drive increases temperature to encourage exploration. When reasoning becomes too scattered (high entropy), it decreases temperature to encourage exploitation.

### Dual-layer memory system

GWA uses a fast Short-Term Working Memory (STM) with a token capacity threshold and a contextual compression mechanism, plus semantic summarization to maintain cognitive continuity without disrupting trajectory. The STM holds the most recent and relevant information, while the semantic memory stores distilled knowledge from past interactions.

### Three-component mapping

GWA implements a three-component mapping inspired by Global Workspace Theory: an active broadcast hub, specialized agents, and discrete cognitive ticks that form a continuous looping process (Cognitive Tick). Each tick represents one cycle of perception, reasoning, and action.

### Decoupled memory management

GWA decouples memory management from reasoning and enforces strict cognitive constraints to prevent attention dilution due to finite LLM context windows. This separation ensures that the agent's reasoning is not overwhelmed by memory management tasks.

---

## 3. Kumiho: Graph-Native Cognitive Memory for AI Agents

**Paper**: arxiv.org/pdf/2603.17244

Kumiho presents a graph-native cognitive memory architecture for AI agents that unifies memory, versioning, provenance, and asset management on a single graph substrate.

### Unified graph substrate

The same graph primitives needed for cognitive memory (immutable versioned snapshots, typed dependency edges, mutable status pointers, URI-based addressing, content-reference separation) also serve for managing multi-agent outputs as versioned, addressable, and linked assets. This eliminates the need for separate memory and asset tracking systems.

### AGM belief revision

Kumiho establishes a structural correspondence between AGM belief revision postulates and graph-native memory operations, including a principled rejection of the Recovery postulate and avoidance of Flouris et al.'s impossibility results. The AGM postulates (K*2 through K*6) are satisfied at the belief-base level (Hansson 1999), providing formal guarantees for consistent memory updates.

### Two-tier memory design

Kumiho uses a two-tier memory design with retrieval safeguards. To maintain consistency (K*5), superseded revisions are kept separate from active ones through retrieval filters (active status) and architecture-enforced constraints (WHERE NOT item.deprecated). Optional full graph access (include_deprecated=true) supports audit and rollback without compromising current belief state.

### Practical architecture features

- Prospective indexing of LLM-generated future scenarios
- Model-decoupled recall (architecture-driven performance, not model choice)
- Asynchronous consolidation and typed epistemic edges for memory relations

### Open questions

Extension to K*7 and K*8 postulates, and broader expressiveness beyond propositional ground triples.

---

## 4. MNEMA: Memory-Native Episodic-Semantic Architecture for Persistent LLM Agents

**Source**: zenodo.org/records/20010220

MNEMA introduces a memory-native cognitive architecture for persistent LLM agents. Key idea: current agents persist as static, file-based state between sessions; MNEMA makes memory the agent's core persistence, with the LLM acting as a thin reasoning layer over structured memory.

### Memory as core persistence

MNEMA treats memory not as an add-on to the agent but as the agent's primary persistence mechanism. The LLM is a reasoning engine that operates over the memory structure, not a stateful entity that maintains its own context. This inverts the traditional architecture where the LLM holds context and memory is secondary.

### Episodic-semantic integration

MNEMA integrates episodic memory (specific experiences) with semantic memory (general knowledge) in a unified structure. Episodic memories are tagged with temporal and contextual metadata, while semantic memories are distilled from episodic memories through a consolidation process.

### Persistent agent identity

By making memory the core persistence, MNEMA enables persistent agent identity across sessions. The agent's personality, knowledge, and learned behaviors are all stored in the memory structure, not in the LLM's context window. This means the agent can maintain continuity even when the LLM changes or when sessions are compacted.

---

## 5. DCPM: Dual-Process Cognitive Memory for Self-Evolving LLM Agents

**Paper**: arxiv.org/html/2606.09483v1

The paper proposes DCPM, a cognitive-capability hierarchy for long-term memory in self-evolving LLM agents, arguing that memory should be treated as cognition rather than mere storage.

### Memory as cognition

DCPM reorganizes memory from raw inputs and facts to active cognitive processes. Memory is not a passive store of information but an active participant in reasoning, decision-making, and learning. The agent's memory system is responsible for understanding, not just remembering.

### Dual-process architecture

DCPM implements a dual-process architecture inspired by Kahneman's System 1 and System 2 thinking. System 1 handles fast, automatic memory operations (retrieval, association), while System 2 handles slow, deliberate memory operations (consolidation, reasoning about memories).

### Self-evolution

DCPM enables self-evolving agents by treating memory as a learning mechanism. The agent's memory system learns from each interaction, refining its understanding of the world and improving its ability to retrieve relevant information. This creates a positive feedback loop where better memory leads to better reasoning, which leads to better memory.

---

## 6. AutoAgent: Evolving Cognition and Elastic Memory Orchestration for Adaptive Agents

**Paper**: arxiv.org/pdf/2603.09716

AutoAgent introduces a framework for evolving, self-improving agent cognition and memory to enable adaptive decision-making without retraining LLM parameters.

### Evolving Cognition

AutoAgent splits agent knowledge into Internal Cognition (tools, skills, self-capabilities) and External Cognition (models of peers and environmental feedback). This dynamic, learnable knowledge base supports on-the-fly contextual decisions rather than static prompts.

### Contextual Decision-Making

The agent blends its current cognition with live context to choose actions from a unified space of Emic Actions (self-driven problem-solving) and Etic Actions (external collaboration). This enables moment-to-moment, adaptive reasoning.

### Elastic Memory Orchestrator

The Elastic Memory Orchestrator acts as the Experience Manager that compresses and structures interaction histories into concise episodic memories, filters redundancies, and retrieves task-relevant context to reduce token load and accelerate reasoning.

### Cognitive Evolution Module (Self-Improvement Engine)

The Cognitive Evolution Module performs meta-cognitive analysis on curated experiences to identify gaps between intent and outcomes. It issues precise, text-based updates to the Cognition Layer and Memory Orchestrator strategies, refining both knowledge and memory organization without external retraining.

### Closed-loop Self-evolution

A practice-driven loop that analyzes action trajectories to align descriptive knowledge with operational reality, continuously updating cognition and memory structures in non-stationary environments.

---

## 7. Agent Cognitive Compressor (ACC)

**Paper**: arxiv.org/pdf/2601.11653

The Agent Cognitive Compressor (ACC) is a bio-inspired memory controller that replaces transcript replay with a bounded internal state updated online at each turn.

### Compressed Cognitive State (CCS)

CCS is the sole persistent internal representation across turns and directly conditions downstream reasoning, tool use, and actions. It is not a transcript or memory cache — it is a control-oriented, abstracted representation that preserves only decision-relevant information, discarding irrelevant or low-utility detail to maintain a stable signal-to-noise ratio over long horizons.

### Separation of recall and commitment

ACC explicitly separates artifact recall from state commitment. Retrieval offers candidate information; compression commits only what is needed for control, ensuring stable long-horizon reasoning and bounded memory growth.

### Schema-constrained compression

ACC uses a schema-constrained Cognitive Compressor Model (CCM) to generate a bounded, controlled internal state that encodes what changed, what matters, constraints, and goals. The schema ensures that the CCS is always well-structured and auditable.

### Benefits

Across scenarios spanning IT operations, cybersecurity response, and healthcare workflows, ACC consistently maintains bounded memory and exhibits more stable multi-turn behavior, with significantly lower hallucination and drift than transcript replay and retrieval-based agents.

---

## 8. MAGMA: A Multi-Graph based Agentic Memory Architecture

**Paper**: arxiv.org/pdf/2601.03236v1

MAGMA is a multi-graph agentic memory architecture that explicitly models heterogeneous relational structure (semantic, temporal, causal, and entity relations) within a unified but disentangled memory substrate.

### Multi-relational graph

MAGMA treats retrieval as a policy-guided graph traversal over multiple relational views, enabling intent-aware selection, independent traversal of views, and fusion into a compact, type-aligned context for generation.

### Dual-stream memory evolution

MAGMA decouples memory ingestion from asynchronous structural consolidation, allowing low-latency updates and long-horizon reasoning through a dual-stream memory evolution process.

### Intent-aware retrieval

MAGMA emphasizes transparent reasoning paths and fine-grained memory control, improving alignment between query intent and retrieved evidence. The intent-aware retrieval ensures that the agent retrieves the most relevant information for its current task.

### Empirical results

Empirical results (LoCoMo, LongMemEval) show MAGMA outperforming state-of-the-art memory systems on long-context tasks with substantial efficiency gains under ultra-long contexts.

---

## 9. Epica: Discipline-Driven AI Agents with Typed Belief Stores

**Source**: github.com/angelnicolasc/epica

Epica is a Rust-based framework for discipline-driven AI agents that maintain a typed, revision-safe belief store with cryptographic auditing and Bayesian monitoring.

### AGM contraction

Epica implements contradiction-aware belief updates using AGM contraction (Alchourrón–Gärdenfors–Makinson) with minimal, core-retainment-based revision before adopting new values. This ensures that belief updates are consistent and principled.

### K*2–K*6 postulates

Epica enforces K*2–K*6 postulates (with K*6 implemented via semantic equivalence when an EmbeddingProvider is installed, to treat paraphrases as equivalent and avoid unnecessary revisions).

### Behavioral contracts

Epica organizes beliefs, intents, goals, and revision rules into C=(P,I,G,R) behavioral contracts. Nine Mnemonic Sovereignty primitives govern memory governance and integrity.

### Four-graph design

Epica uses a multi-graph knowledge representation (Four-graph design) to support robust belief management rather than a single monolithic graph.

### Dual-process uncertainty

System 1 (causal propagation via Noisy-OR) and System 2 (async LLM reflection when confidence drifts) coordinate belief updates. Optional Free Energy (Friston) monitor tracks surprise and agent drift.

### Implementation

Implemented as 12 Rust crates + 2 CLIs; end-to-end tested with formal revisions and audit trails (Merkle + BLAKE3 in AuditLedger).

---

## 10. ElephantBroker: A Knowledge-Grounded Cognitive Runtime

**Paper**: arxiv.org/pdf/2603.25097

ElephantBroker introduces an open-source cognitive runtime for trustworthy, LLM-based AI agents. It presents an eight-component architecture that governs knowledge handling, reasoning, safety, and governance.

### Eight components

The architecture includes: Knowledge Store, Reasoning Engine, Safety Monitor, Governance Controller, Memory Manager, Perception Module, Action Executor, and Reflection Agent. Each component has clear responsibilities and interfaces.

### Trustworthiness focus

ElephantBroker is designed with trustworthiness as a primary concern. The Safety Monitor and Governance Controller ensure that the agent's actions are safe and compliant with policies. The Reflection Agent provides meta-cognitive oversight.

---

## 11. Toward a Theory of Hierarchical Memory for Language Agents

**Paper**: arxiv.org/pdf/2603.21564

The paper presents a unifying theory for hierarchical memory in language agents, introducing a three-operator decomposition.

### Three-operator decomposition

- **Extraction (α)**: Maps raw data into atomic units
- **Coarsening (C = (π, ρ))**: Partitions units and assigns relevance scores
- **Hierarchical organization**: Structures units into levels of abstraction

### Formal framework

The paper provides a formal framework for understanding how memory systems can be designed to balance detail and abstraction, enabling agents to reason at multiple levels of granularity.

---

## 12. Focus: Active Context Compression

**Paper**: arxiv.org/abs/2601.07190v1

Focus introduces an autonomous agent-centric memory management approach for large language model (LLM) tasks, addressing context bloat during long-horizon software engineering.

### Agent self-regulation

Focus enables agents to autonomously manage their own context, deciding what to keep, compress, or discard. This self-regulation prevents context bloat without requiring external intervention.

### Compression strategies

Focus implements multiple compression strategies: truncation, summarization, and selective forgetting. The agent chooses the appropriate strategy based on the current context state and task requirements.

---

## Implications for omp-noesis

These cognitive architectures inform the noesis design in several ways:

1. **Dual-store memory** (CraniMem, MNEMA): Noesis should have fast episodic state (current session) and durable semantic state (cross-session beliefs). The `session.compacting` hook is the consolidation boundary.

2. **Attentional gating** (CraniMem, GWA): Noesis should gate what enters the belief layer. Not every tool result deserves a belief entry. The `tool_result` hook should filter, not capture everything.

3. **Bounded state** (ACC, CraniMem): Noesis state must be bounded. The 2000-token preamble budget is the constraint. Learning entries, beliefs, and inferences must all have eviction policies.

4. **AGM belief revision** (Kumiho, Epica): Noesis should implement principled belief updates. When a new fact contradicts an existing belief, the system should handle it formally, not just append.

5. **Graph-native memory** (Kumiho, MAGMA): Graphify provides the graph substrate. Noesis should leverage Graphify's knowledge graph as the long-term semantic memory, not duplicate it.

6. **Memory as cognition** (DCPM, MNEMA): Noesis treats cognitive state as the agent's identity, not just context. The agent IS its cognitive state.

7. **Self-evolution** (AutoAgent, DCPM): Noesis should enable the agent to improve its own cognitive state through the learning loop, creating a positive feedback cycle.
