# omp-noesis: Context Management Model

> Version: 1.0
> Date: 2026-06-12
> Status: Aligned

---

## 1. Purpose

This document defines how noesis should manage context.

It exists to answer one question clearly:

> **How does noesis keep an agent effective as sessions grow, context pressure rises, and compaction or resets occur?**

This is not a runtime implementation spec yet.
It is the alignment model that future implementation should follow.

---

## 2. Core Position

Noesis is not only a memory layer.
It is a **context architecture**.

Its job is not to preserve as many tokens as possible.
Its job is to preserve the **smallest high-signal state** that keeps the agent effective.

That means noesis must optimize for:
- cognitive continuity
- token efficiency
- smart-zone preservation
- recoverability after compaction or reset
- graph-grounded retrieval instead of transcript accumulation

---

## 3. The Problem Model

### 3.1 Context is the bottleneck

The key limitation is not nominal context-window size.
The key limitation is that agent quality degrades as context becomes:
- too large
- too noisy
- too stale
- too transcript-heavy
- too weakly grounded

### 3.2 Smart zone vs dumb zone

The useful budget is the **effective reasoning zone**, not the maximum context window.

A model may technically accept a very large context while already performing worse.
The degradation is gradual:
- it forgets earlier instructions
- it repeats solved mistakes
- it over-reads irrelevant files
- it hallucinates despite contradictory context

Noesis should therefore optimize for **quality within a bounded active context**, not just survival inside a huge one.

### 3.3 Memento discipline

The agent should be allowed to start fresh.
Noesis should not treat the full transcript as sacred.

What must survive across compaction, clearing, or fresh sessions is:
- active beliefs
- active decisions
- live workflow commitment
- unresolved hypotheses
- meaningful learning
- a minimal account of current focus

Noesis should preserve cognition, not clutter.

---

## 4. Four Core Operations

The context model follows four operations, aligned with broader context-engineering practice.

### 4.1 Write

Persist durable cognition outside the active transcript.

Examples:
- beliefs
- decisions
- learning entries
- workflow commitment
- survivor state for compaction

### 4.2 Select

Choose what deserves to be visible in the next model call.

Selection should prefer:
- high relevance to the current goal
- current unresolved work
- graph-grounded evidence
- recent meaningful failures or decisions
- compact state over replayed transcript

### 4.3 Compress

Reduce what is preserved into a bounded, high-signal form.

Compression should act on:
- prior turns
- bulky tool outputs
- low-confidence or resolved material
- stale reasoning that no longer affects execution

### 4.4 Isolate

Keep unrelated work from contaminating the current reasoning loop.

Isolation should come from:
- OMP subagents
- task-scoped retrieval
- bounded preambles
- externalized artifacts instead of ever-growing inline history

---

## 5. Context Layers

Noesis should treat context as layered, not flat.

### 5.1 Layer A: Live context

This is what the model sees directly on the current call.

Includes only:
- system prompt and harness instructions from OMP
- current user/task messages
- the noesis cognitive preamble
- the specific files, tool results, and graph evidence needed now

This layer must stay aggressively bounded.

### 5.2 Layer B: Working cognitive state

This is the noesis-owned structured state that survives beyond a single turn.

Includes:
- attention
- beliefs
- decisions
- inference state
- commitment/workflow state
- learning

This layer is durable, structured, and selectively exposed.
It is not dumped wholesale into every call.

### 5.3 Layer C: External evidence and artifacts

This is information recoverable on demand.

Includes:
- Graphify graph artifacts and queries
- files in the repo
- rendered workflow artifacts
- optional Obsidian projections
- broader memory systems like Mnemopi/Hindsight

This layer should remain mostly outside the active context until selected.

---

## 6. What Must Stay Live

The following items are the default candidates for live exposure in the preamble or compaction survivor set.

### 6.1 Always high-priority
- current focus
- active workflow goal and current step
- active decisions
- active beliefs above confidence threshold
- unresolved hypotheses blocking progress
- recent learning directly relevant to the current task

### 6.2 Conditionally high-priority
- graph-derived facts tied to current files or domain
- recent failures likely to recur in the same task
- verification state when it affects next action
- file targets when the work is actively scoped to them

### 6.3 Normally not live
- full transcript history
- raw tool outputs after they are processed
- resolved hypotheses with no remaining impact
- stale beliefs superseded by newer ones
- broad vault content
- generic long-term memory not relevant to the current task

---

## 7. Compaction Survivor Policy

Compaction should preserve a **survivor subset**, not the entire state and not a plain-English narrative only.

### 7.1 Survivor set

The survivor set should include:
- current focus summary
- active workflow goal and immediate next steps
- active decisions
- active beliefs above threshold
- unresolved hypotheses
- recent relevant learning
- pointers to exact recoverable artifacts when needed

### 7.2 Survivor exclusions

Compaction should exclude by default:
- low-signal historical conversation
- old raw tool results
- stale or superseded beliefs
- verbose reasoning chains already resolved
- large evidence blobs recoverable from Graphify or files

### 7.3 Survivor principle

> **If it can be re-fetched exactly and cheaply, it usually should not survive inline.**

What survives inline should be what is expensive to rediscover cognitively, not what is easy to reload mechanically.

---

## 8. Retrieval-Before-Read Policy

A central noesis behavior should be:

> **Query structure before loading bulk.**

Graphify should help the agent narrow what deserves active attention before large file reads or broad exploration.

Preferred order:
1. understand current goal
2. inspect noesis cognitive state
3. query Graphify for relevant structure
4. load only the most relevant files or artifacts
5. update beliefs and workflow

This prevents transcript-heavy and file-heavy thrashing.

---

## 9. Tool-Result Handling Policy

Tool results should not accumulate blindly.

### 9.1 Keep inline only when needed
Keep tool output live only when it still directly informs the next reasoning step.

### 9.2 Convert significant results into state
Important events should be translated into noesis state:
- failures → learning candidates
- important confirmations → beliefs or verification state
- workflow-changing outputs → commitment updates

### 9.3 Clear or externalize bulky results
Large results that are re-fetchable should not remain part of active cognition once processed.

This follows the same principle as server-side tool-result clearing:
- preserve the outcome
- drop the noise

---

## 10. Preamble Model

The cognitive preamble should be a bounded projection of the working cognitive state.

### 10.1 Purpose
It should answer, at minimum:
- what am I doing?
- what do I currently believe?
- what decisions are active?
- what am I testing?
- what have I learned that matters right now?

### 10.2 Constraints
The preamble must be:
- short
- structured
- current
- easy to scan
- biased toward active execution needs

### 10.3 Anti-pattern
The preamble must not become a second transcript.

---

## 11. Smart-Zone Budget Model

At alignment level, noesis should assume a bounded effective reasoning budget exists even if exact thresholds differ by model.

### 11.1 Product stance
Noesis should actively protect a smart zone rather than waiting for hard overflow.

### 11.2 Practical consequences
That means:
- proactive compaction matters
- preambles must stay bounded
- graph-guided retrieval matters
- large tool outputs should be cleared or externalized
- fresh-session recovery must be strong enough that resetting is safe

### 11.3 Near-term design question
The exact operational budget should be decided later per model/harness policy, but the product assumption is fixed:

> **quality falls before the hard limit, so context management must act before the hard limit.**

---

## 12. Relationship to Other Systems

### 12.1 OMP
OMP owns execution lifecycle and compaction machinery.
Noesis uses OMP hooks to inject and preserve cognitive state.

### 12.2 Graphify
Graphify improves selection and grounding.
It reduces blind exploration and helps noesis spend tokens where they matter.

### 12.3 Mnemopi / Hindsight
These remain broader memory surfaces.
Noesis should not duplicate them.
Instead, noesis should own the task-relevant working cognitive state and decide what deserves active exposure.

### 12.4 Obsidian
Obsidian is optional reflection.
It may receive projected artifacts, but it must not be required for runtime context quality.

---

## 13. Design Rules

1. **Preserve the smallest high-signal state, not the biggest history.**
2. **Prefer structure over prose when preserving cognition.**
3. **Prefer retrieval over replay when evidence is recoverable.**
4. **Prefer graph-guided narrowing before file loading.**
5. **Promote outcomes into state; demote bulky raw outputs out of context.**
6. **Treat resets and compaction as normal, not exceptional.**
7. **Protect the smart zone before the session collapses into a dumb zone.**
---
## 14. Resolved Design Decisions

The open questions from the initial alignment draft have been answered.
Each answer is grounded in evidence from OMP defaults, Graphify's confidence model, published research, and current field practice.

### 14.1 Belief confidence threshold for live exposure

**Decision**: confidence ≥ 0.75 for preamble inclusion.

**Grounding**:
- Graphify now uses discrete forced-rank INFERRED confidence scores: {0.55, 0.65, 0.75, 0.85, 0.95}.
- 0.75 is the lowest score meaning "reasonable (contextual but not explicit)."
- EXTRACTED edges = confidence 1.0 always exposed.
- AMBIGUOUS edges are never converted to beliefs.

**Behavior**:
- confidence ∈ [0.75, 1.0] → active belief, eligible for preamble and survivor set
- confidence ∈ [0.50, 0.74] → low-confidence belief, kept in state file, surfaced only when directly task-relevant
 
**Preamble behavior**: low-confidence beliefs are **counted** in the preamble header (e.g. `Beliefs: 12 active, 3 low-conf`) but are **excluded** from the rendered body. Only active beliefs (confidence ≥ 0.75) appear in the `[Beliefs]` section. The low-confidence count serves as a compact awareness signal without bloating the preamble.

### 14.2 Default survivor set

**Decision**: fixed survivor shape with capped sizes.

| Item | Cap | Rationale |
|---|---|---|
| Focus | 2 sentences | Task context needs minimal orientation |
| Active workflow goal + current step + 1 next step | 3 items | Driving execution, must survive |
| Active decisions | 5 most recent | Prevents revisiting settled questions |
| Active beliefs ≥ 0.75 | 10 most recent | Evidence-worth-carrying budget |
| Unresolved hypotheses | 3 most blocking | Costly to rediscover |
| Recent learning | 3 highest-ranked | Failure patterns, task-relevant fixes |
| Learning summary counters | always | Compact stats for preamble display |
| State file pointer | 1 path | Recover full state, not just survivors |

**Grounding**:
- OMP's `session.compacting` hook accepts structured `context` and `preserveData`.
- CWL paper stores structured work records, not verbatim transcript.
- Anthropic's compaction guidance prefers architectural decisions, unresolved issues, implementation details.

### 14.3 Learning ranking

**Decision**: weighted recency-scored ranking.

| Factor | Weight | Rationale |
|---|---|---|
| Recency | 1.0 base, decays 0.2 per older sibling | Newer is generally more relevant |
| Task relevance | 1.0 (same domain), 0.5 (different domain), 0.0 (unrelated) | Domain match via `skillScope` |
| Failure | 2.0 (failure), 1.0 (success pattern) | Failures are higher-signal |
| Resolved fix | 2.0 (rootCause + fix populated), 1.0 (not resolved) | Resolved entries are most actionable |

Top 3 by computed score in preamble. All learning persists in state file regardless.

**Grounding**: Perplexity's gotchas flywheel treats failures as highest-signal; Anthropic's compaction preserves what changed behavior.

### 14.4 Graphify relevance-signal mapping

**Decision**: Graphify signals translate directly into noesis attention and belief heuristics.

| Graphify signal | Noesis use |
|---|---|
| God nodes (highest centrality) | Files deserving early attention |
| Community membership | Scoping beliefs and relevance to architectural domain |
| Path distance from current working files | Relevance decay function |
| Edge confidence (EXTRACTED/INFERRED/AMBIGUOUS) | Belief confidence level |
| Surprise connections (cross-community edges) | Flagged for explicit attention, not auto-believed |
| Graph freshness (last `graphify update .` timestamp) | Stale-flag for all graph-derived beliefs |

**Grounding**: Graphify already provides community detection, god-node ranking, path length, and confidence labels. Noesis maps these, does not recalculate them.

### 14.5 Stale-state markers

**Decision**: one status field per cognitive object type, kept minimal.

| State type | Status values |
|---|---|
| Belief | `active` \| `superseded` \| `archived` |
| Decision | `active` \| `superseded` \| `archived` |
| Hypothesis | `testing` \| `confirmed` \| `refuted` \| `abandoned` |
| Workflow | `draft` \| `active` \| `done` \| `abandoned` |
| Workflow step | `pending` \| `active` \| `done` \| `skipped` |
| Learning entry | no explicit stale marker (relevance scoring handles it) |

Beliefs carry `supersededBy: beliefId` pointer when status is `superseded`, providing audit trail. Archived beliefs kept for provenance, never exposed in preamble.

**Grounding**: AGM belief revision requires supersession tracking. Kumiho uses explicit edge types for contradiction and supersession.
### 14.6 Preamble token budget

**Decision**: 2000 tokens maximum, confirmed against OMP budget.

**Grounding**:
- OMP's `compaction.reserveTokens` defaults to 16384.
- OMP's `compaction.keepRecentTokens` defaults to 20000.
- 2000 tokens is ~10% of OMP reserve budget — non-trivial but not dominant.
- CWL paper uses ~80k token budget with ~30% headroom; 2000 tokens is ~2.5% of smart-zone budget.
- Prior PRD already specified 2000 tokens; no evidence suggests change.

**Implementation notes**:
- The 2000-token limit is an estimate; the code enforces a hard character cap of 8000 chars (`MAX_TOKENS * 4`, assuming ~4 chars/token).
- The full preamble is XML-escaped before return (`escapeXml()`) for safe OMP injection into the `<additional-context>` block (see `preamble-builder.ts`).

**Trim strategy** (`preamble-builder.ts :: trimToBudget`):

This is a **whole-section drop strategy**, not an oldest-first within-section truncation.

1. Compute token estimate via `estimateTokens()`
2. If over budget: rebuild the Beliefs section with active facts only (same active-only filter as initial build; this is effectively a no-op)
3. If still over budget: **drop the Learning section entirely** — header and all content removed as a block
4. If still over budget: **drop the Hypotheses section entirely** — header and all content removed as a block
5. If character length exceeds 8000: hard character truncate with `...` ellipsis suffix

The never-truncate safeguard for active workflow goal, active decisions, and unresolved hypotheses described in earlier design drafts is **not implemented**. There is no per-section eviction resistance in the current `trimToBudget` implementation. This is a known gap (see §14.6.1).

**Known gap — §14.6.1 Missing per-section eviction safeguards**

The `trimToBudget` function does not enforce the never-truncate guarantee for active workflow, active decisions, or unresolved hypotheses. Under extreme budget pressure, trimming can remove all body sections except the preamble header. Future work should add eviction-resistant markers per section.

**Subagent preamble** (`preamble-builder.ts :: buildSubagentPreamble`):

The `taskFilter` parameter is accepted but **ignored** — the subagent always renders the top-3 learning entries (failures + successes) rather than filtering by task scope. The preamble is built with `capability: "FULL"`, rendering all sections regardless of the subagent's actual capability level.

### 14.7 Proactive compaction vs reset + survivor reload

**Decision**: prefer proactive compaction; reset + reload as quality-recovery fallback.

| Trigger | Action |
|---|---|
| Context exceeds ~80% of OMP's idle threshold (~160k tokens) | Proactive compaction via `session.compacting` |
| OMP automatic threshold maintenance fires | Noesis injects survivor set |
| User runs `/compact` | Noesis injects full survivor set |
| Multiple repeated errors of same class in one session | Recommend reset + survivor reload |
| User explicitly requests fresh start | Survivor reload from `state.json` |
| Crossing session boundary (new session, handoff) | Survivor reload from `state.json` |

**Grounding**:
- OMP's `compaction.idleThresholdTokens` default is 200000.
- CWL paper uses ~80k token ceiling (~30% of model window).
- Syrin uses 60% proactive trigger.
- Matt Pocock's smart-zone degradation around 100k-150k tokens.
- OMP default strategy is `context-full` (LLM summarization); noesis augments, does not replace.

**Rationale**: Proactive compaction preserves flow. Reset + survivor reload is for recovery when degradation has already occurred. Noesis should bias toward keeping the session alive with good state.

---

## 15. OMP Compaction Integration

Noesis integrates with OMP's existing compaction settings, not against them.

### OMP Defaults (relevant subset)

| Setting | Default | Noesis impact |
|---|---|---|
| `compaction.strategy` | `"context-full"` | LLM summarization; noesis provides structured survivors |
| `compaction.reserveTokens` | `16384` | Noesis preamble (≤2000 tokens) fits inside this budget |
| `compaction.keepRecentTokens` | `20000` | Recent context preserved by OMP; noesis state complements it |
| `compaction.idleThresholdTokens` | `200000` | Proactive compaction trigger reference point |
| `compaction.autoContinue` | `true` | Noesis must handle auto-continue without losing state |

### Hook integration point

Noesis uses exactly one compaction hook: `session.compacting`.

The hook returns:
- `context`: noesis survivor set injected as `<noesis-state>` tags in OMP's `<additional-context>` block
- `preserveData.noesis`: full structured state stored on the compaction entry for exact recovery

Noesis does not override the compaction prompt or replace the default strategy.

---

## 16. References

Internal grounding:
- `docs/PRD.md`
- `docs/boundary-matrix.md`
- `docs/research/03-context-management.md`
- `docs/research/04-graphify-labs.md`
- `docs/research/05-omp-platform.md`
- `docs/stale/omp-noesis-strategic-blueprint.md`

External grounding:
- Anthropic, Effective context engineering for AI agents: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Anthropic, Context editing docs: https://platform.claude.com/docs/en/build-with-claude/context-editing
- Beyond Compaction: Structured Context Eviction (CWL): https://arxiv.org/html/2606.11213v1
- Graphify forced-rank INFERRED confidence scores (PR #546): https://github.com/safishamsi/graphify/pull/546
- Graphify how-it-works (v8, confidence model): https://github.com/safishamsi/graphify/blob/v8/docs/how-it-works.md
- Matt Pocock AI Coding Dictionary, Smart zone: https://raw.githubusercontent.com/mattpocock/dictionary-of-ai-coding/main/dictionary/Smart%20zone.md
- Matt Pocock AI Coding Dictionary, Memory system: https://raw.githubusercontent.com/mattpocock/dictionary-of-ai-coding/main/dictionary/Memory%20system.md
- Syrin Context Compaction docs: https://docs.syrin.dev/agent-kit/core/context-compaction
