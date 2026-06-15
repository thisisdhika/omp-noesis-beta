---
name: noesis-belief
description: >
  Load when the agent needs to manage beliefs formally: add facts, make decisions,
  handle contradictions, revise existing beliefs, or understand AGM revision rules.
  Load when the user asks about "what we believe", "change our mind", or "contradiction".
globs: ["**/*"]
alwaysApply: false
depends: ["noesis"]
---

# Noesis Belief Management

## AGM Revision Rules

When you add a belief that contradicts an existing active belief:
1. The old belief is marked `superseded` (never deleted)
2. The old belief gets `supersededBy: newBelief.id`
3. The new belief is added as `active`
4. Both beliefs remain in the archive tier for audit

## Confidence Mapping

| Source | Default Confidence | Overrideable? |
|---|---|---|
| Graphify EXTRACTED | 1.0 | No |
| Graphify INFERRED 0.95 | 0.95 | No |
| Graphify INFERRED 0.85 | 0.85 | No |
| Graphify INFERRED 0.75 | 0.75 | No |
| Graphify INFERRED 0.65 | 0.65 | No |
| Graphify INFERRED 0.55 | 0.55 | No |
| Graphify AMBIGUOUS | Never promoted | — |
| Execution | 1.0 | Yes (lower if ambiguous) |
| User | 1.0 | Yes (lower if uncertain) |
| Inference | 0.5 | Yes (must assign explicit) |

## Writing High-Signal Beliefs

- **Fact**: "JWT middleware at {path} validates {mechanism}"
- **Decision**: "Use {choice} over {alternative} because {rationale}"
- **Tag**: Always include domain tags for relevance filtering

## Common Mistakes

- **Mistake**: Forgetting to declare `contradictsIds` when correcting yourself
- **Mistake**: Using `source: "inference"` with confidence 1.0
- **Mistake**: Writing vague beliefs without file paths or specific mechanisms
