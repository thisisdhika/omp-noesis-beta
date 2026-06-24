# Belief Revision Model

> **Version:** 1.0.0 | **Updated:** 2026-06-24

## Philosophy

Beliefs are never deleted — they are superseded, archived, and audited. This is AGM-based revision at the belief-base level (Hansson 1999).

## Adopted Postulates

| Postulate | Meaning | Implementation |
|---|---|---|
| **K\*2** (Success) | New belief always included | Every `noesis_believe_fact` produces an active `BeliefFact` |
| **K\*3** (Inclusion) | Result ⊆ old + new | Active set = old − contradicted + new |
| **K\*4** (Preservation) | Consistent info → no loss | Non-contradicting beliefs untouched |
| **K\*5** (Consistency) | Result is consistent | Contradicted beliefs superseded before new accepted |
| **K\*6** (Equivalence) | Same content → same result | Content deduplication before insert |
| **Relevance** | Only relevant beliefs revised | Only overlapping tags touched |
| **Core-Retainment** | Uncontradicted kept | Non-involved beliefs remain active |

### Rejected Postulates

| Postulate | Reason |
|---|---|
| **Recovery** | Contradicts immutable versioning |
| **K\*7, K\*8** | Require logical closure beyond propositional scope |
| **K\*1** (Closure) | Belief-base approach relaxes closure |

## Two-Tier Design

- **Active tier** (`status: "active"`) — source of truth, eligible for preamble/survivor
- **Archive tier** (`status: "superseded" | "archived"`) — auditable history, not in preamble

## Supersession Algorithm

1. Validate contradictory belief exists and is active
2. Set old `status = "superseded"`, `supersededBy = newId`
3. Add new belief as active
4. Persist both
5. Flag dependent decisions/hypotheses for review

## Revision Chains

```
B1 (superseded) → B2 (superseded) → B3 (active)
```

Chain head is always active. Archived beliefs do not participate.

## Confidence Rules

| Source | Default | Overrideable? |
|---|---|---|
| Graphify EXTRACTED | 1.0 | No |
| Graphify INFERRED | 0.55–0.95 | No |
| Execution | 1.0 | Yes (lower if ambiguous) |
| User | 1.0 | Yes (lower if uncertain) |
| Inference | 0.5 | Yes (must assign explicit) |

## Separation of Recall and Commitment

- **Recall**: Graphify, files, tool output, user statements
- **Commitment**: Active `BeliefFact` or `BeliefDecision` — only created via explicit `noesis_believe_*` tools

The gap is intentional: not everything retrieved deserves to be believed.

## Audit Trail

Every revision preserves:
- Original content, confidence, source, timestamp
- `supersededBy` pointer linking old → new
- Both `updatedAt` timestamps

Enables: inspection, rollback, debugging, PR review.
