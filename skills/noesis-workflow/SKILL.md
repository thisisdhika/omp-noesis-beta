---
name: noesis-workflow
description: >
  Load when the agent needs to track multi-step plans, manage workflow state across
  compaction, or ensure continuity of execution. Load when using `noesis_commit`.
globs: ["**/*"]
alwaysApply: false
depends: ["noesis"]
---

# Noesis Workflow Management

## Commitment Layer Rules

- **Workflow tracks cognition, not execution**: OMP owns `todo`, `orchestrate`, swarm
- **Steps have dependencies**: Use `dependsOn` for topological ordering
- **Steps have verification**: Always include a verification command when possible
- **Never delete completed steps**: They remain in the array for audit

## Workflow Status Lifecycle

```
draft → active → done | abandoned
```

When a new workflow becomes active, the previous active workflow is auto-archived.

## Step Status Lifecycle

```
pending → active → done | skipped
```

## Consistency Checks

Noesis warns if:
- Workflow status is `active` but all steps are `done` (should be `done`)
- Workflow status is `done` but steps are `pending` (incomplete)
- Step dependencies are circular (prevents execution)

## Common Mistakes

- **Mistake**: Using `noesis_commit` as a replacement for OMP's `todo`
- **Mistake**: Not including verification commands (you can't prove completion)
- **Mistake**: Creating workflows with 20+ steps (keep it focused, use sub-workflows)
