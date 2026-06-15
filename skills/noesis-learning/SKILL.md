---
name: noesis-learning
description: >
  Load when the agent needs to capture failures, record root causes, document fixes,
  or prevent repeated mistakes. Load when the user says "don't do that again" or
  "remember this for next time".
globs: ["**/*"]
alwaysApply: false
depends: ["noesis"]
---

# Noesis Learning Loops

## The Capture → Diagnose → Fix → Apply Loop

1. **Capture**: `tool_result` hook auto-creates minimal failure entry
2. **Diagnose**: You analyze root cause and call `noesis_believe(type: "learning")`
3. **Fix**: You implement the fix and verify it works
4. **Apply**: Next session, the learning entry surfaces in preamble via ranking

## Ranking Formula

Learning entries are ranked by:
```
rank = recency × taskRelevance × failureMultiplier × resolvedFixMultiplier
```
- `failureMultiplier`: 2.0 (failures are higher-signal than successes)
- `resolvedFixMultiplier`: 2.0 (resolved entries are most actionable)
- `taskRelevance`: 1.0 same domain, 0.5 different, 0.0 unrelated

## Writing Effective Learning Entries

- **description**: What happened, truncated to 500 chars
- **rootCause**: The actual cause, not the symptom
- **fix**: The exact fix, including commands or file changes
- **skillScope**: Domain tag for relevance matching

## Common Mistakes

- **Mistake**: Resolving learning without actually verifying the fix
- **Mistake**: Writing generic root causes ("it was broken")
- **Mistake**: Forgetting to tag with `skillScope` so it never surfaces again
