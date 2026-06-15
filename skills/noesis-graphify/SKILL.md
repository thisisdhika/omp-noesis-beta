---
name: noesis-graphify
description: >
  Load when the agent needs to query the codebase graph, understand community structure,
  or translate Graphify evidence into beliefs. Load when `noesis_attend` includes graphQueries.
globs: ["**/*"]
alwaysApply: false
depends: ["noesis"]
---

# Noesis Graphify Perception

## Query Patterns

| Intent | Query Example |
|---|---|
| Find entry points | "What are the god nodes?" |
| Find auth patterns | "What functions handle authentication?" |
| Find dependencies | "What depends on the database module?" |
| Impact analysis | "graphify path src/auth.ts src/api.ts" |
| Deep dive | "graphify explain UserService" |

## Capability Levels

| Level | Behavior |
|---|---|
| FULL | Normal queries, full confidence mapping |
| STALE | Normal queries, confidence penalty (-1 tier) |
| NO_GRAPH | Attempt build, otherwise no graph beliefs |
| DEGRADED | No queries, execution/user beliefs only |

## Evidence-to-Belief Pipeline

1. Run `noesis_attend({ graphQueries: [...] })`
2. Graphify findings appear in preamble (ephemeral, not auto-committed)
3. You verify findings via file reads or execution
4. You call `noesis_believe` to commit verified findings as beliefs
5. Uncommitted findings are cleared after one render

## Common Mistakes

- **Mistake**: Auto-believing Graphify INFERRED edges without verification
- **Mistake**: Not checking capability level before querying
- **Mistake**: Running graphQueries on every turn (expensive, run once per task)
