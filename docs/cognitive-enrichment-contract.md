# omp-noesis: Cognitive Enrichment Contract

> Version: 1.0
> Date: 2026-06-12
> Status: Aligned

---

## 1. Purpose

This document defines how noesis enriches OMP's existing planning and execution with cognition.

It answers one question:

> **Noesis does not create its own plan format. How does it make OMP's plans smarter?**

---

## 2. The Boundary

OMP already owns the plan surface:

| OMP primitive | What it does |
|---|---|
| `todo` | Task list with status tracking |
| `plan` subagent | Creates plans in conversation |
| `orchestrate` keyword | Multi-phase parallel-subagent coordination |
| `@oh-my-pi/swarm-extension` | YAML DAG swarms with dependency resolution |
| Workflow tool (PR #1559) | Sandboxed JS runner with TUI |

Noesis must not create a competing plan format, workflow document, or step renderer.

Noesis enriches these existing surfaces by injecting cognition into the agent's context so that whatever planning OMP does is informed by:
- what the agent currently believes
- what decisions are active
- what has been learned from past execution

> **OMP owns the plan. Noesis owns the cognition behind it.**

---

## 3. The Enrichment Mechanism

Noesis enriches OMP planning through a single mechanism: the **cognitive preamble**.

The preamble is injected into every LLM call via the `context` hook. It carries:

| Content | From layer | Why it helps planning |
|---|---|---|
| Current focus | Attention | What the agent should be working on |
| Active beliefs (≥0.75 confidence) | Belief | Ground truths the plan must respect |
| Active decisions | Belief | Past choices the plan must not contradict |
| Live workflow commitment | Commitment | What the agent already committed to do |
| Unresolved hypotheses | Inference | Open questions that affect plan feasibility |
| Top 3 ranked learning entries | Learning | Known failures and fixes to avoid |

---

## 4. How Beliefs Enrich Planning

When OMP's `plan` subagent or `orchestrate` keyword activates:

```
1. OMP runs its normal planning logic
2. The context hook injects the cognitive preamble
3. The preamble includes active beliefs — ground truths about the codebase
4. The plan respects these beliefs without the agent needing to re-discover them
```

Example:

Without noesis:
> Agent: "Let me check what auth patterns exist… (reads 5 files) …ok, I see we use JWT middleware. Plan: add OAuth2 alongside JWT."

With noesis:
> Agent: "Active beliefs show JWT middleware at `src/auth/jwt.ts`, community: Authentication. Plan: add OAuth2 at `src/auth/oauth2.ts` alongside existing JWT."

The plan is the same. The difference: faster, grounded, no re-discovery.

---

## 5. How Decisions Enrich Planning

When replanning occurs (session 2, after compaction, or mid-task correction):

```
1. OMP replans however it normally would
2. The cognitive preamble includes active decisions with rationale
3. The new plan does not contradict past decisions unless explicitly superseded
4. If a decision was superseded, the agent sees the revision chain
```

Example:

Without noesis:
> Agent (session 2): "Let's use session cookies for auth." (forgot the JWT decision from session 1)

With noesis:
> Agent (session 2): "Active decision: Use JWT over session cookies. Rationale: stateless auth required for scaling. I'll plan within that constraint."

---

## 6. How Learning Enriches Planning

When planning a task similar to one that previously failed:

```
1. OMP creates a plan for the task
2. The cognitive preamble includes top-ranked learning entries
3. The plan accounts for known failure patterns
4. Verification steps are added for previously-failed checks
```

Example:

Without noesis:
> Agent: "Plan step 3: Run `bun test`. Step 4: Commit." (no awareness of past failures)

With noesis:
> Agent: "Learning shows `bun test` failed last time due to missing `jsonwebtoken` dependency. Plan: Step 2: `bun add jsonwebtoken`. Step 3: `bun test`. Step 4: Commit."

---

## 7. What Noesis Never Does

Noesis must never:

| Anti-pattern | Why |
|---|---|
| Create its own plan file (`.omp/noesis/workflows/*.md`) | OMP owns the plan surface |
| Render workflow steps as a separate document | Steps live in `state.json`; OMP renders whatever format it needs |
| Compete with `todo` for step tracking | `todo` is OMP's task tracker; noesis provides beliefs behind the tasks |
| Replace `orchestrate` or swarm DAGs | Those are execution coordination; noesis provides cognition behind coordination |
| Replicate the workflow tool (PR #1559) | That tool is a sandboxed runner; noesis enriches the context it runs in |

---

## 8. The Commitment Layer in State

The `CommitmentLayer` in `state.json` (§7 of cognitive-state-schema) still exists. It tracks what the agent has committed to do. But it is internal cognitive state — not a user-facing plan document.

Its purpose:
- Survive compaction so the agent remembers its current task
- Provide the workflow goal + current step + next step in the preamble
- Feed the survivor set during compaction

Its anti-purpose:
- Be rendered as a standalone plan document
- Replace OMP's `todo`
- Become a workflow viewer

---

## 9. Optional: State File as Review Artifact

The state file itself (`.omp/noesis/state.json`) is the durable cognitive artifact. It can be:
- committed to git alongside code changes
- diffed in PRs to show belief/decision/learning changes
- read by the agent in future sessions

This is the "reviewable artifact" the PRD promises — not a separate workflow document, but the state file itself showing cognitive evolution.

---

## 10. Design Rules

1. **OMP owns the plan surface. Noesis owns the cognition behind it.**
2. **The cognitive preamble is the enrichment mechanism.**
3. **No separate plan format, workflow document, or step renderer.**
4. **The state file is the durable artifact — commit it, diff it, review it.**
5. **CommitmentLayer tracks what the agent is doing for continuity, not for display.**
6. **Beliefs, decisions, and learning inform OMP plans; they do not replace them.**

---

## 11. References

Internal grounding:
- `docs/PRD.md` (§12.5: projection layer, §3.2: what noesis is not)
- `docs/context-management-model.md` (§5.2: working cognitive state, §10: preamble model)
- `docs/cognitive-state-schema.md` (§7: CommitmentLayer)
- `docs/research/05-omp-platform.md` (orchestration, swarm, workflow tool)

External grounding:
- OMP orchestration: `orchestrate` keyword (v15.6.0)
- OMP swarm: `@oh-my-pi/swarm-extension`
- OMP workflow tool: PR #1559
- OMP issue #1544: dynamic workflow discussion
