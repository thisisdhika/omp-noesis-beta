# omp-noesis: Belief Revision Model

> **Version:** 0.1.0  
> **Date:** 2026-06-15  
> **Status:** Finalized

## 1. Philosophy

Noesis treats belief revision as a first-class cognitive operation, not an afterthought. Beliefs are never deleted — they are superseded, archived, and audited.

## 2. AGM Postulates Adopted

Noesis implements K*2 through K*6 at the belief-base level (Hansson 1999).

| Postulate | Meaning | Implementation |
|---|---|---|
| **K*2** (Success) | New info always included | Every `noesis_believe` produces an active BeliefFact |
| **K*3** (Inclusion) | Result is subset of expansion | Active set = old set - contradicted + new |
| **K*4** (Preservation) | Consistent new info → no loss | Non-contradicting belief leaves existing untouched |
| **K*5** (Consistency) | Result is consistent | Contradicted beliefs superseded before new one accepted |
| **K*6** (Equivalence) | Equivalent inputs → same result | Content deduplication before insert |
| **Relevance** (Hansson) | Only relevant beliefs revised | Only overlapping tags touched |
| **Core-Retainment** (Hansson) | Uncontradicted beliefs kept | Non-involved beliefs remain active |

### Postulates Explicitly Rejected

| Postulate | Reason |
|---|---|
| **Recovery** | Contradicts immutable versioning. Rejected per Kumiho. |
| **K*7, K*8** | Require full logical closure, exceed propositional scope. |
| **K*1** (Closure) | Belief-base approach relaxes closure. No auto-derivation. |

## 3. Two-Tier Design

### Active Tier
- Status: `active`
- Source of truth for agent's current beliefs
- Filtered by `status = "active"` in all retrieval
- Eligible for survivor set

### Archive Tier
- Status: `superseded` or `archived`
- `superseded`: replaced by newer belief (has `supersededBy` pointer)
- `archived`: manually retired, not contradicted
- Not exposed in preamble or survivor set
- Accessible for audit, rollback, provenance

## 4. Supersession Algorithm

```
Given: newFact N contradicts active belief O

1. VALIDATE
   - O.status must be "active"
   - O.id must exist in belief.facts

2. SUPERSEDE O
   - O.status = "superseded"
   - O.supersededBy = N.id
   - O.updatedAt = now()

3. ADD N
   - N.status = "active"
   - N.id = new unique id
   - N.createdAt = now()
   - N.updatedAt = now()

4. PERSIST
   - Push N to belief.facts[]
   - O remains in belief.facts[] (archive tier)

5. PROPAGATE
   - Flag decisions/hypotheses that cite O as evidence
   - Surface in preamble: "Belief X superseded; decisions Y, Z may need review"
```

## 5. Revision Chains

```
B1 (superseded) → B2 (superseded) → B3 (active)
```

- Chain head is always active (no `supersededBy`)
- Walking backward gives full revision history
- Archived beliefs do not participate in chains

## 6. Confidence Rules

| Source | Default | Overrideable? |
|---|---|---|
| Graphify EXTRACTED | 1.0 | No |
| Graphify INFERRED | 0.55-0.95 | No |
| Execution | 1.0 | Yes (lower if ambiguous) |
| User | 1.0 | Yes (lower if uncertain) |
| Inference | 0.5 | Yes (must assign explicit) |

## 7. Separation of Recall and Commitment

- **Recall**: Graphify results, file contents, tool outputs, user statements
- **Commitment**: `active` BeliefFact or BeliefDecision

The gap is intentional: not everything retrieved deserves to be believed. Explicit `noesis_believe` is required.

## 8. Decision Revision

Decisions follow the same two-tier pattern:
- Superseded: old decision gets `status = "superseded"`, `supersededBy = newDecision.id`
- Archived: old decision gets `status = "archived"` (no `supersededBy`)
- Decisions do not auto-cascade to facts — agent is responsible for follow-up

## 9. Audit Trail

Every revision preserves:
- Original content, confidence, source, timestamp
- `supersededBy` pointer linking old → new
- Both `updatedAt` timestamps

Enables: inspection, rollback, debugging, PR review

## 10. Design Rules

1. Never delete, only supersede or archive.
2. Active tier is the only source of truth.
3. Every supersession leaves an auditable chain.
4. Confidence is evidence-grounded for graph sources.
5. Separation of recall and commitment prevents noise.
6. Agent identifies contradictions; noesis enforces rules.
7. No runtime dependencies for belief operations.
