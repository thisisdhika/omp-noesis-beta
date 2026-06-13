# Belief Revision — Full Research

> Source: Academic papers, framework documentation, and formal logic (2025-2026)
> Compiled: 2026-06-12

---

## 1. AGM Belief Revision Theory

**Source**: Alchourrón, Gärdenfors, Makinson (1985)

AGM is the standard framework for rational belief revision. It defines how an agent should update its beliefs when receiving new information.

### AGM Postulates

The AGM postulates (K*1 through K*8) define the rationality constraints on belief revision:

- **K*1**: The result of revision is a belief set (closed under logical consequence).
- **K*2**: The new information is included in the revised belief set.
- **K*3**: The revised belief set is a subset of the original belief set expanded with the new information.
- **K*4**: If the new information is consistent with the original belief set, then the revised belief set is consistent.
- **K*5**: If the new information is consistent, then the revised belief set is consistent.
- **K*6**: If the new information is equivalent to another piece of information, then revising by either yields the same result.
- **K*7**: The result of revising by a conjunction is a subset of the result of revising by the first conjunct and then the second.
- **K*8**: If the new information is consistent with the original belief set, then the result of revising by the conjunction is not a subset of the result of revising by the first conjunct alone.

### Belief Base Postulates (Hansson 1999)

Hansson's belief-base approach relaxes some AGM postulates:

- **Relevance**: Only beliefs that are relevant to the new information should be revised.
- **Core-Retainment**: Beliefs that are not contradicted by the new information should be retained.

### Recovery Postulate

The Recovery postulate states that if you revise by P and then revise by not-P, you should recover your original beliefs. This is often rejected because it leads to counterintuitive results.

---

## 2. Kumiho: Graph-Native Belief Revision

**Paper**: arxiv.org/pdf/2603.17244

Kumiho establishes a formal link between AGM belief revision and graph-native memory operations.

### Key result

A structural correspondence at the belief-base level (Hansson 1999) showing that the basic AGM postulates K*2–K*6 and Hansson's Belief-Base postulates (Relevance, Core-Retainment) are satisfied in the memory framework.

### Recovery rejection

Kumiho explicitly rejects the Recovery postulate via immutable versioning. Superseded revisions are kept separate from active ones through retrieval filters (active status) and architecture-enforced constraints (WHERE NOT item.deprecated). Optional full graph access (include_deprecated=true) supports audit and rollback without compromising current belief state.

### Two-tier memory design

- **Active tier**: Current beliefs, filtered by status
- **Archive tier**: Superseded beliefs, accessible for audit and rollback

### Retrieval safeguards

- Active status filter: `WHERE NOT item.deprecated`
- Optional full graph access: `include_deprecated=true`
- Architecture-enforced constraints prevent accidental access to superseded beliefs

### Practical architecture features

- Prospective indexing of LLM-generated future scenarios
- Model-decoupled recall (architecture-driven performance, not model choice)
- Asynchronous consolidation and typed epistemic edges for memory relations

### Open questions

Extension to K*7 and K*8 postulates, and broader expressiveness beyond propositional ground triples.

---

## 3. Epica: Discipline-Driven Belief Stores

**Source**: github.com/angelnicolasc/epica

Epica is a Rust-based framework for discipline-driven AI agents that maintain a typed, revision-safe belief store with cryptographic auditing and Bayesian monitoring.

### AGM contraction

Epica implements contradiction-aware belief updates using AGM contraction (Alchourrón–Gärdenfors–Makinson) with minimal, core-retainment-based revision before adopting new values. This ensures that belief updates are consistent and principled.

### K*2–K*6 postulates

Epica enforces K*2–K*6 postulates (with K*6 implemented via semantic equivalence when an EmbeddingProvider is installed, to treat paraphrases as equivalent and avoid unnecessary revisions).

### Semantic equivalence

When an EmbeddingProvider is installed, Epica treats paraphrases as equivalent. This prevents unnecessary revisions when the agent receives information that is semantically identical to existing beliefs but expressed differently.

### Behavioral contracts

Epica organizes beliefs, intents, goals, and revision rules into C=(P,I,G,R) behavioral contracts:
- **P**: Beliefs (what the agent believes)
- **I**: Intents (what the agent intends to do)
- **G**: Goals (what the agent wants to achieve)
- **R**: Revision rules (how beliefs should be updated)

Nine Mnemonic Sovereignty primitives govern memory governance and integrity.

### Four-graph design

Epica uses a multi-graph knowledge representation (Four-graph design) to support robust belief management rather than a single monolithic graph.

### Dual-process uncertainty

System 1 (causal propagation via Noisy-OR) and System 2 (async LLM reflection when confidence drifts) coordinate belief updates. Optional Free Energy (Friston) monitor tracks surprise and agent drift.

### Implementation

Implemented as 12 Rust crates + 2 CLIs; end-to-end tested with formal revisions and audit trails (Merkle + BLAKE3 in AuditLedger).

---

## 4. XTrace: Belief Revision System

**Source**: xtrace.ai/research/belief-revision-system

XTrace provides an AGM-style belief revision system for multi-agent AI, designed to keep a living, provenance-traced knowledge base across sessions.

### Core idea

Maintain atomic beliefs (e.g., user preferences, architectural choices, API contracts) with provenance tracking. Each belief has:
- A unique identifier
- Content (the belief itself)
- Confidence level
- Source (where the belief came from)
- Provenance chain (how the belief was derived)
- Status (active, superseded, retracted)

### Provenance tracing

Every belief revision is traced back to its source. This creates an audit trail that shows:
- Why a belief was added
- What caused it to be revised
- What the previous belief was
- Who or what triggered the revision

---

## 5. MAGMA: Multi-Graph Agentic Memory

**Paper**: arxiv.org/pdf/2601.03236v1

MAGMA explicitly models heterogeneous relational structure (semantic, temporal, causal, and entity relations) within a unified but disentangled memory substrate.

### Intent-aware retrieval

MAGMA treats retrieval as a policy-guided graph traversal over multiple relational views, enabling intent-aware selection, independent traversal of views, and fusion into a compact, type-aligned context for generation.

### Asynchronous consolidation

MAGMA decouples memory ingestion from asynchronous structural consolidation, allowing low-latency updates and long-horizon reasoning through a dual-stream memory evolution process.

### Belief consistency

MAGMA maintains belief consistency through:
- Typed epistemic edges that encode the relationship between beliefs
- Asynchronous consolidation that resolves conflicts
- Intent-aware retrieval that selects the most relevant beliefs

---

## 6. Agent Cognitive Compressor (ACC): State Commitment

**Paper**: arxiv.org/pdf/2601.11653

ACC explicitly separates artifact recall from state commitment.

### Separation of recall and commitment

Retrieval offers candidate information; compression commits only what is needed for control, ensuring stable long-horizon reasoning and bounded memory growth. This is a form of belief revision where only validated information becomes part of the committed state.

### Schema-constrained compression

ACC uses a schema-constrained Cognitive Compressor Model (CCM) to generate a bounded, controlled internal state that encodes what changed, what matters, constraints, and goals. The schema ensures that belief updates are well-structured.

---

## 7. CraniMem: Attentional Gating

**Paper**: arxiv.org/pdf/2603.15642

CraniMem's attentional gating is a form of belief filtering — deciding what information deserves to become a belief.

### Selective encoding

The attentional gate decides what information from the current interaction is worth encoding into the episodic buffer. This prevents noise and irrelevant details from consuming memory capacity and becoming beliefs.

### Systems consolidation

CraniMem periodically replays high-utility episodic traces into the knowledge graph, discarding low-utility items. This is a form of belief promotion — moving from tentative beliefs (episodic) to established beliefs (semantic).

---

## 8. Belief Revision for Noesis

Based on all the research, here is how belief revision should work in noesis:

### Belief lifecycle

1. **Tentative**: New information from tool execution or graph query. Confidence: 0.0 or 0.5.
2. **Established**: Verified through multiple sources or repeated confirmation. Confidence: 1.0.
3. **Superseded**: Replaced by newer, more accurate information. Status: "superseded".
4. **Rettracted**: Explicitly removed because it was wrong. Status: "retracted".

### Revision operations

1. **Expansion**: Add a new belief without removing existing beliefs. Used when the new information is consistent with existing beliefs.
2. **Contraction**: Remove a belief without adding new ones. Used when a belief is retracted.
3. **Revision**: Add a new belief and remove contradictory beliefs. Used when the new information contradicts existing beliefs.

### Consistency enforcement

- When adding a belief, check for contradictions with existing beliefs.
- If a contradiction is found, use AGM contraction to remove the contradicted belief before adding the new one.
- Preserve the contradicted belief in the archive tier for audit.

### Confidence model

- **0.0**: Low confidence. Information from a single source, not verified.
- **0.5**: Medium confidence. Information from multiple sources or verified once.
- **1.0**: High confidence. Information verified through execution or confirmed by the user.

### Source tracking

Every belief has a source:
- **graph**: From Graphify query
- **execution**: From tool execution (test pass, build success)
- **user**: From the user directly
- **inference**: From the agent's own reasoning

### Supersession

When a new belief contradicts an existing belief:
1. Mark the existing belief as "superseded"
2. Add the new belief with the superseded belief's ID in a `supersedes` field
3. Preserve both beliefs for audit

---

## Implications for omp-noesis

1. **AGM-compliant belief revision**: Noesis should implement K*2–K*6 postulates. When a new fact contradicts an existing belief, the system should handle it formally, not just append.

2. **Two-tier memory** (Kumiho): Active beliefs and archived beliefs. The active tier is what the agent sees in its preamble. The archived tier is for audit and rollback.

3. **Confidence model** (Epica): Three confidence levels (0.0, 0.5, 1.0) with source tracking. Beliefs start at 0.0 and are promoted through verification.

4. **Provenance tracing** (XTrace): Every belief revision should be traced back to its source. This creates an audit trail that shows why beliefs changed.

5. **Attentional gating** (CraniMem): Not every tool result deserves a belief. The `tool_result` hook should filter for significant events only.

6. **Semantic equivalence** (Epica): When an EmbeddingProvider is available, treat paraphrases as equivalent to prevent unnecessary revisions.

7. **Separation of recall and commitment** (ACC): Noesis should separate what the agent retrieves (graph findings, tool results) from what it commits (beliefs, decisions). Only validated information becomes a committed belief.
