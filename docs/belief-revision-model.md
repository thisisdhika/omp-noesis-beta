# omp-noesis: Belief Revision Model

> Version: 1.0
> Date: 2026-06-12
> Status: Aligned

---

## 1. Purpose

This document defines how noesis revises beliefs.

It answers three questions:
- When a new fact contradicts an existing belief, what exactly happens?
- How does the system stay consistent without losing history?
- What rules govern confidence, provenance, and auditability?

---

## 2. Belief Revision Philosophy

Noesis treats belief revision as a first-class cognitive operation, not an afterthought.

This is grounded in:
- **AGM theory** (Alchourrón–Gärdenfors–Makinson, 1985): the standard framework for rational belief change
- **Kumiho** (arxiv 2603.17244): formal correspondence between AGM postulates and graph-native memory operations, with explicit Recovery rejection
- **Epica** (github.com/angelnicolasc/epica): typed belief stores with AGM contraction, semantic equivalence, and behavioral contracts
- **Atlas** (github.com/RichSchefren/atlas): RippleEngine for downstream propagation, 49-scenario AGM compliance verification

The governing principle:

> **Beliefs are never deleted. They are superseded, archived, and audited.**

---

## 3. AGM Postulates Adopted

Noesis implements K*2 through K*6 at the belief-base level (Hansson 1999).

| Postulate | What it means | How noesis satisfies it |
|---|---|---|
| **K*2** (Success) | New information is always included | Every `noesis_believe` call produces a new BeliefFact with status `active` |
| **K*3** (Inclusion) | The result is a subset of expansion | The active set is the old set minus contradicted beliefs plus the new one |
| **K*4** (Preservation) | Consistent new info → no loss | A non-contradicting belief leaves existing beliefs untouched |
| **K*5** (Consistency) | The result is consistent | Contradicted beliefs are always superseded before the new one is accepted |
| **K*6** (Equivalence) | Logically equivalent inputs → same result | Content-based deduplication before insert; identical content is a no-op |
| **Relevance** (Hansson) | Only relevant beliefs are revised | Only beliefs that contradict or are directly implicated by the new belief are touched |
| **Core-Retainment** (Hansson) | Uncontradicted beliefs are kept | Beliefs not involved in a contradiction remain `active` |

### Postulates explicitly not adopted

| Postulate | Why rejected |
|---|---|
| **Recovery** | Revising by P then ¬P should not recover original beliefs; contradicts immutable versioning. Rejected per Kumiho's formal argument. |
| **K*7, K*8** | Require full logical closure over belief sets, which exceeds noesis's propositional scope. Kumiho identifies these as open questions for ground-triple systems. |
| **K*1** (Closure) | Belief-base approach (Hansson) relaxes logical closure. Noesis does not derive new beliefs from conjunctions of existing ones — the agent explicitly adds beliefs. |

---

## 4. Two-Tier Design

Beliefs live in one of two tiers, modeled after Kumiho's active/archive architecture.

### Active tier
- Contains beliefs with status `active`
- These are the beliefs the agent currently holds
- Filtered by `status: "active"` in all retrieval
- Exposed in the cognitive preamble
- Eligible for the compaction survivor set

### Archive tier
- Contains beliefs with status `superseded` or `archived`
- Superseded: replaced by a newer belief (carries `supersededBy` pointer)
- Archived: no longer relevant but not contradicted (manually retired)
- Not exposed in preamble or survivor set
- Accessible on-demand for audit, rollback, and provenance inspection

Retrieval safeguard:

> Active tier retrieval always filters `WHERE status = "active"`.

Full-history access is opt-in only, for audit purposes.

---

## 5. Contradiction Detection

A contradiction exists when a new belief conflicts with an existing active belief.

### Definition

Two beliefs contradict if they make incompatible claims about the same subject. In noesis's propositional scope, this means:

- **Content-level contradiction**: the content strings express opposing facts about the same entity, behavior, or contract
- **Tag-scoped contradiction**: beliefs tagged with the same domain tags that express incompatible claims

### Detection algorithm

```
Given: newFact (BeliefFact to be added)

1. Find candidate conflicts:
   - Any active belief tagged with overlapping tags AND having different content semantics
   - Any active belief about the same entity (matched via content substring or tag overlap)

2. Determine if contradiction exists:
   - The LLM (via noesis_believe) is responsible for declaring contradictions
   - Noesis provides the active belief set for the LLM to compare against
   - Noesis enforces the revision rules, but the LLM identifies the contradiction

3. If the LLM declares contradiction with belief B:
   → run supersession algorithm (§6)
   → add newFact as active
```

Noesis does not perform automated semantic contradiction detection (no embedding model dependency). The agent declaratively identifies contradictions through `noesis_believe`.

This is a design choice: noesis is model-agnostic and runtime-dependency-free. Semantic equivalence (K*6-level) is approximated by exact content match rather than embedding comparison. Epica-style semantic equivalence with an EmbeddingProvider is a future optional enhancement, not v1.

---

## 6. Supersession Algorithm

When a new belief `N` contradicts an existing active belief `O`:

```
1. VALIDATE
   - O.status must be "active"
   - O.id must exist in belief.facts
   - If O is already superseded, this is a chain extension (see §7)

2. SUPERSEDE O
   - O.status = "superseded"
   - O.supersededBy = N.id
   - O.updatedAt = now()

3. ADD N
   - N.status = "active"
   - N.id = new unique id
   - N.createdAt = now()
   - N.updatedAt = now()

4. ADD TO FACTS
   - Push N to belief.facts[]
   - O remains in belief.facts[] (archival tier, not deleted)

5. PROPAGATE (see §8)
   - If any decision or hypothesis explicitly depends on O, flag it
```

### Guarantees

- **No data loss**: O is never removed; it moves to the archive tier
- **Consistency**: only one version of a belief is active at a time
- **Auditability**: O.supersededBy → N.id forms a revision chain
- **Rollback safety**: the archive tier preserves all history for inspection

---

## 7. Revision Chains

A revision chain is the linked list formed by `supersededBy` pointers:

```
B1 (superseded) → B2 (superseded) → B3 (active)
```

### Properties
- The chain head is always the active belief (no `supersededBy`)
- Walking backward from active → superseded gives full revision history
- The chain length is the number of times the belief has been revised
- Archived beliefs do not participate in chains (they are retired, not replaced)

### Chain extension
When an already-superseded belief O is referenced as the contradiction target:
- This is an error: the active version of O should be the target
- Noesis resolves this by walking the chain to find the active version
- If no active version exists (all archived), treat as a fresh addition

---

## 8. Confidence Propagation

When a belief is superseded, related beliefs may lose evidential support.

### Simple propagation (v1)

When belief O is superseded by N:

```
1. Identify beliefs that cite O as evidence:
   - BeliefFact where source evidence or reasoning references O.id
   - BeliefDecision where rationale references O.id
   - Hypothesis where evidence references O.id

2. Flag them:
   - Do not auto-revise (v1 is conservative)
   - Add a note in the belief's content? No — keep schema clean.
   - Surface in the cognitive preamble: "Belief X was superseded; decisions Y and Z may need review."

3. The agent is responsible for follow-up:
   - The cognitive preamble shows the revision event
   - The agent can call noesis_believe to update downstream beliefs
```

### Future enhancement

Atlas-style RippleEngine propagation (automatic confidence re-evaluation on `Depends_On` edges) is a future enhancement, not v1. It requires:
- Explicit dependency edges between beliefs (adds schema complexity)
- Confidence re-computation rules (adds runtime complexity)
- Contradiction cascades (adds behavioral complexity)

v1 keeps it simple: supersede + flag + agent follow-up.

---

## 9. Source-Based Confidence Rules

Confidence is assigned based on source, following the Graphify→noesis mapping (boundary-matrix §8).

| Source | Default confidence | Overridable? |
|---|---|---|
| `"graph"` | Mapped from Graphify edge confidence | No — graph evidence confidence is evidence-grounded |
| `"execution"` | 1.0 (observed directly) | Yes — agent can lower if uncertain |
| `"user"` | 1.0 (stated by user) | Yes — agent can lower if user expressed uncertainty |
| `"inference"` | 0.5 (deduced, not observed) | Yes — agent must assign explicit confidence |

### Graph-sourced beliefs
- EXTRACTED → 1.0
- INFERRED 0.95 → 0.95
- INFERRED 0.85 → 0.85
- INFERRED 0.75 → 0.75
- INFERRED 0.65 → 0.65
- INFERRED 0.55 → 0.55
- AMBIGUOUS → never promoted to belief

### Execution-sourced beliefs
- Default 1.0 (the agent observed it happen)
- Agent can lower confidence if the result was ambiguous
- Example: "test passed" → 1.0; "build succeeded but with warnings" → 0.8

### User-sourced beliefs
- Default 1.0 (the user stated it)
- Agent can lower if user expressed uncertainty ("I think...", "maybe...")
- Example: "We use Postgres" → 1.0; "I think the timeout is 30s" → 0.6

### Inference-sourced beliefs
- Default 0.5 (deduced, not directly observed)
- Agent must assign explicit confidence in the range [0.5, 0.95]
- Example: "Based on the pattern in auth.ts, the session likely expires in 1h" → 0.65

---

## 10. Separation of Recall and Commitment

Aligned with ACC, noesis separates retrieval from commitment:

### Recall (what was found)
- Graphify query results
- File contents read by the agent
- Tool outputs
- User statements

### Commitment (what is believed)
- BeliefFact with status `active`
- BeliefDecision with status `active`

The gap between recall and commitment is intentional:
- Not everything retrieved deserves to be believed
- The agent must explicitly commit via `noesis_believe`
- This prevents noise from becoming cognitive state

CraniMem's attentional gating principle applies here: the `tool_result` hook captures significant events, but only explicit `noesis_believe` calls create committed beliefs.

---

## 11. Integration with the Cognitive State Schema

The belief revision model operates on the `BeliefLayer` defined in the cognitive state schema.

### Fields consumed
- `BeliefFact.id` — target for supersession
- `BeliefFact.status` — `active` | `superseded` | `archived`
- `BeliefFact.supersededBy` — revision chain pointer
- `BeliefFact.confidence` — for preamble eligibility (≥0.75)
- `BeliefFact.source` — determines default confidence
- `BeliefFact.tags` — for contradiction scope matching
- `BeliefDecision.id`, `.status`, `.supersededBy` — same pattern for decisions

### Fields not touched by revision
- `BeliefFact.communityScope` — Graphify-derived, informational
- `BeliefFact.createdAt`, `.updatedAt` — managed by the persistence layer

### Revision invariants
1. No belief is ever removed from `belief.facts[]`
2. Exactly one version of a belief claim is `active` at a time
3. The `supersededBy` chain always terminates at an `active` belief
4. Archived beliefs have no `supersededBy` (they are retired, not replaced)

---

## 12. Decision Revision

Decisions follow the same two-tier pattern as facts:

### Superseding a decision
- When a new decision replaces an old one (e.g., "We're switching from JWT to sessions"):
  - Old decision: `status = "superseded"`, `supersededBy = newDecision.id`
  - New decision: `status = "active"`, includes rationale for the change

### Archiving a decision
- When a decision becomes irrelevant (e.g., the feature it governed was removed):
  - `status = "archived"` (no `supersededBy`)
  - Remains in the archive tier for provenance

### Decision-fact relationship
- Decisions do not automatically cascade to facts
- The agent is responsible for updating related facts when a decision changes
- Noesis surfaces decision changes in the preamble

---

## 13. Audit Trail

Every belief revision produces an auditable trail.

### What is preserved
- The superseded belief with original content, confidence, source, and timestamp
- The `supersededBy` pointer linking old → new
- Both `updatedAt` timestamps (old belief's revision time, new belief's creation time)

### What the trail enables
- **Inspection**: "What did the agent believe about auth before this change?"
- **Rollback**: "Revert to the belief before the last revision"
- **Debugging**: "Why did the agent make decision D? → It was based on belief B3, which superseded B2, which superseded B1"
- **PR review**: The state file diff shows belief changes alongside code changes

### What the trail does not do (v1)
- Cryptographic hashing (Epica-style Merkle/BLAKE3 audit ledger)
- Embedding-based semantic equivalence detection
- Automated rollback (manual inspection only)

---

## 14. Non-Goals

Noesis's v1 belief revision model deliberately excludes:

| Non-goal | Why excluded | Where it lives |
|---|---|---|
| Full logical closure (K*1, K*7, K*8) | Exceeds propositional scope; belief-base approach per Hansson | — |
| Recovery postulate | Contradicts immutable versioning; formally rejected per Kumiho | — |
| Embedding-based semantic equivalence | Requires runtime dependency; optional future enhancement | Epica-style EmbeddingProvider (future) |
| Automated downstream propagation | Adds schema and runtime complexity | Atlas RippleEngine (future) |
| Cryptographic audit ledger | Adds runtime dependency; v1 uses structural audit trail | Epica AuditLedger (future) |
| Bayesian surprise monitoring | Adds complexity not needed for v1 correctness | Epica Free Energy monitor (future) |
| Multi-agent belief negotiation | Out of scope for single-agent cognition | OMP swarm/orchestration layer |

---

## 15. Design Rules

1. **Never delete, only supersede or archive.**
2. **The active tier is the only source of truth for the agent's current beliefs.**
3. **Every supersession leaves an auditable chain.**
4. **Confidence is evidence-grounded for graph sources, agent-assigned for inference.**
5. **Separation of recall and commitment prevents noise from becoming cognition.**
6. **The agent identifies contradictions; noesis enforces the revision rules.**
7. **No runtime dependencies for belief operations. Filesystem only.**

---

## 16. References

Internal grounding:
- `docs/PRD.md`
- `docs/boundary-matrix.md`
- `docs/cognitive-state-schema.md` (BeliefLayer, BeliefFact, BeliefDecision)
- `docs/research/01-cognitive-architectures.md` (Kumiho, ACC, CraniMem, Epica)
- `docs/research/08-belief-revision.md` (AGM postulates, Kumiho, Epica, XTrace)

External grounding:
- AGM theory: Alchourrón, Gärdenfors, Makinson (1985)
- Hansson belief-base postulates (1999)
- Kumiho (graph-native belief revision): https://arxiv.org/abs/2603.17244v1
- Epica (typed belief stores): https://github.com/angelnicolasc/epica
- Atlas (AGM-compliant memory with RippleEngine): https://github.com/RichSchefren/atlas
- MemEX (structured multi-session belief state): https://github.com/ai-2070/memex
