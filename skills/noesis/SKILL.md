---
name: noesis
description: >
  Load when the agent needs to remember facts, track decisions, learn from failures,
  manage workflow state, or query its own cognitive history across sessions.
  Load when working on multi-step tasks that span compaction boundaries.
  Load when the codebase is complex enough to benefit from graph-grounded beliefs.
  Load when the user asks the agent to "remember", "don't forget", "track", or "learn".
globs: ["**/*"]
alwaysApply: false
depends: []
metadata:
  version: 0.1
  author: omp-noesis
---

# Noesis Cognitive Substrate

You have access to a structured cognitive state system called **noesis**. It is not a memory database — it is a **context architecture** that keeps you effective under context pressure.

## When to Use Noesis Tools

**ALWAYS call `noesis_attend` at the start of a new task or when switching context.**
This sets your focus and optionally gathers Graphify evidence.

**ALWAYS call `noesis_believe` when you verify something important.**
- Facts: "We use JWT at src/auth/jwt.ts"
- Decisions: "Use PostgreSQL over MongoDB"
- Learning: After fixing a failure, resolve the learning entry

**ALWAYS call `noesis_commit` when you create or update a plan.**
This makes your workflow durable across compaction and sessions.

**ALWAYS call `noesis_recall` before assuming you don't know something.**
You may already have a belief or learning entry about this.

**Use `noesis_infer` when you have an open question or theory.**
Track hypotheses explicitly so you don't retest the same theory.

**Use `noesis_focus` for quick context switches within the same task.**
Faster than `noesis_attend` when you don't need Graphify queries.

## Belief Writing Rules

1. **Be specific, not vague.**
   Bad: "We use auth."
   Good: "JWT middleware at src/auth/jwt.ts validates Bearer tokens against HS256 secret."

2. **Include confidence and source.**
   - `source: "graph"` → confidence from Graphify edge label
   - `source: "execution"` → confidence 1.0 (you observed it)
   - `source: "user"` → confidence 1.0 (user stated it)
   - `source: "inference"` → confidence 0.5-0.95 (you deduced it)

3. **Tag by domain.**
   Use tags like `["auth"]`, `["database"]`, `["performance"]`, `["testing"]`.

4. **Declare contradictions explicitly.**
   If a new fact contradicts an existing belief, set `contradictsIds: ["bf-xxx"]`.
   Noesis will handle the AGM revision automatically.

## Learning Capture Rules

1. **Capture failures immediately.**
   When a tool fails, the `tool_result` hook auto-creates a minimal learning entry.
   You MUST later call `noesis_believe(type: "learning", ...)` to resolve it with rootCause and fix.

2. **Root cause must be actionable.**
   Bad: "It didn't work."
   Good: "Missing jsonwebtoken dependency caused import failure in test suite."

3. **Fix must be verifiable.**
   Bad: "Fixed it."
   Good: "Added jsonwebtoken to package.json and ran bun install. Verified with bun test."

## Graphify Query Rules

1. **Query structure before loading bulk.**
   Use `noesis_attend({ graphQueries: ["What functions handle auth?"] })` before blind file reads.

2. **Trust EXTRACTED, verify INFERRED, ignore AMBIGUOUS.**
   - EXTRACTED edges → confidence 1.0 (always believe)
   - INFERRED edges → confidence 0.55-0.95 (verify before believing)
   - AMBIGUOUS edges → never promoted to belief

3. **Use god nodes and communities.**
   God nodes are high-centrality files — start there.
   Communities are architectural domains — scope your beliefs to them.

## Gotchas (Highest-Value Content)

- **GOTCHA: Do not believe everything Graphify says.**
  Graphify is perception, not truth. Always verify before committing.

- **GOTCHA: Do not duplicate OMP's plan surface.**
  `noesis_commit` tracks workflow for continuity, not for display.
  OMP's `todo`, `orchestrate`, and swarm own the execution plan.

- **GOTCHA: Do not capture every tool result.**
  Only significant events (failures, build successes, test passes) become learning.
  Routine file reads and echo commands are noise.

- **GOTCHA: Beliefs are never deleted.**
  Superseded beliefs remain in the archive tier for audit.
  If you need to correct yourself, add a new belief that contradicts the old one.

- **GOTCHA: The preamble is bounded to 2000 tokens.**
  Only high-confidence beliefs (≥0.75) and recent decisions appear live.
  Low-confidence beliefs are stored but not surfaced unless task-relevant.

- **GOTCHA: Noesis does not replace Mnemopi or Hindsight.**
  Noesis owns task-relevant working cognitive state.
  Mnemopi owns cross-session general memory.
  They complement each other.

- **GOTCHA: Always check `noesis_recall` before rediscovering.**
  The agent's biggest waste is re-reading files it already understood.
  Recall first, read second.

- **GOTCHA: Focus strings must be under 200 characters.**
  Long focus strings waste preamble budget. Be concise.

- **GOTCHA: `noesis_vault_search` is for human artifacts, not runtime state.**
  For live runtime state, use `noesis_recall`.
  Vault search queries projected Markdown notes from past sessions.
