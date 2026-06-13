# omp-noesis: Implementation Architecture

> Version: 1.0
> Date: 2026-06-13

## 1. Purpose

This document turns the aligned product/design contracts into a concrete implementation plan for `src/`.

It answers:
- what modules exist
- what each module owns
- how tools and hooks are wired
- how state moves through the system
- what stays synchronous, what stays deferred, and what is explicitly out of band

This is an implementation architecture document, not a product brief.

---

## 2. Governing Decisions

The implementation assumes these settled rules:

1. One runtime-owned in-memory mutation boundary.
2. Attention is lazy-checkpointed; belief/inference/commitment/learning persist immediately.
3. One canonical `buildPreamble(state): string` renderer.
4. Graceful degraded startup.
5. One singleton `GraphifyClient`.
6. `StateManager` exposes `read()`, `mutate()`, `checkpointAttention()`.
7. Contradictions are explicit via `contradictsIds`.
8. Disk is authoritative across session boundaries; `preserveData.noesis` is fallback only.
9. Learning is two-phase: capture first, promote later.
10. Four discriminator-style tool schemas are the public cognitive API.
11. `noesis_commit` defaults to extend, with explicit replace.
12. Hook roles do not overlap.
13. Learning promotion reuses `noesis_believe`.
14. Confirmed hypotheses auto-promote to beliefs.
15. Graphify perception is only agent-initiated via `noesis_attend`.
16. Uncommitted graph evidence lives in ephemeral `attention.graphFindings`.
17. Relevant graph evidence is rendered once and cleared.
18. Low-confidence beliefs are gated into a separate section.
19. Non-attention writes persist synchronously and atomically.
20. Preamble sections have fixed order and caps.
21. Focus refresh is owned by the `context` hook with fallback chain.
22. Status transitions are hybrid: mechanical where observable, explicit where judgment is required.
23. Learning store has a hard cap with rank-based eviction.
24. Learning cap is shared, with failure-biased retention.
25. Graphify capability renders as a compact structured block.
26. Completed steps stay in `workflow.steps[]`; live views filter by status.
27. Obsidian projection is deferred and best-effort.
28. No archived step tier in v1.
29. Existing graph beliefs get stale-confidence adjustment.
30. In-memory state is authoritative during a live session; reload on session boundaries.
31. Workflow status is explicit, with consistency warnings only.
32. Completed workflows archive when a newer workflow becomes active.
33. Stale-era graph beliefs are flagged for review after refresh, not auto-rewritten.
34. Projection flush is batched per turn.
35. Graph capability annotates, not suppresses, existing cognition unless evidence is impossible.

---

## 3. Source Tree

```text
src/
  index.ts
  schema.ts
  runtime/
    createRuntime.ts
    state-manager.ts
    preamble.ts
    survivors.ts
    focus.ts
    consistency.ts
  store/
    filesystem-store.ts
    migrations.ts
  perception/
    graphify-client.ts
    graphify-translate.ts
    graphify-parse.ts
    graphify-capability.ts
  tools/
    attend.ts
    believe.ts
    infer.ts
    commit.ts
  hooks/
    context.ts
    before-agent-start.ts
    session-compacting.ts
    session-compact.ts
    tool-result.ts
  learning/
    candidates.ts
    ranking.ts
    eviction.ts
  belief/
    revise.ts
    stale-confidence.ts
  projection/
    projector.ts
    obsidian.ts
    batch.ts
  util/
    ids.ts
    time.ts
    paths.ts
    tokens.ts
    text.ts
```

### Why this split

- `runtime/` owns orchestration inside the extension.
- `store/` owns disk persistence only.
- `perception/` owns Graphify transport + translation.
- `tools/` and `hooks/` stay thin adapters.
- `belief/`, `learning/`, and projection code isolate policy from transport.
- `util/` contains only boring shared helpers.

---

## 4. Module Responsibilities

### 4.1 `src/index.ts`

Owns extension registration only.

Responsibilities:
- create the runtime singleton once
- register all four tools with `pi.registerTool`
- register all hook handlers with `pi.on`
- avoid runtime actions during module load beyond safe setup

Non-goals:
- no business logic
- no state mutation rules
- no Graphify subprocess logic

### 4.2 `src/schema.ts`

Owns TypeScript types + zod schemas.

Responsibilities:
- `NoesisState`
- tool param schemas
- runtime-internal helper types (`GraphFinding`, `LearningCandidate`, etc.)
- version constant and empty-state factory

Rule:
- runtime and store code depend on this; schema depends on nothing else

### 4.3 `src/store/filesystem-store.ts`

Owns disk IO only.

Responsibilities:
- read `state.json`
- validate and migrate
- write temp → fsync → rename
- expose no policy, only persistence primitives

Interface shape:
- `loadState(projectRoot): NoesisState`
- `saveState(projectRoot, state): void`
- `statePath(projectRoot): string`

### 4.4 `src/runtime/state-manager.ts`

Owns in-memory authority.

Responsibilities:
- current in-memory snapshot
- `read()`
- `mutate()`
- `checkpointAttention()`
- dirty tracking for attention only
- synchronous atomic persist for non-attention mutations
- session-boundary invalidation/reload

Invariants:
- only this module mutates durable state
- hooks/tools never mutate raw objects directly outside `mutate()`
- reads return the latest committed snapshot

### 4.5 `src/runtime/preamble.ts`

Owns `buildPreamble(state, runtimeContext): string`.

Responsibilities:
- fixed section order
- per-section caps
- capability block
- graph evidence section
- low-confidence signal section
- token trimming
- one-shot graph evidence rendering + clear contract consumption

Note:
- although earlier design simplified to `buildPreamble(state): string`, implementation needs a tiny render context for things not persisted directly as durable state, such as capability status and stale-review warnings. Keep that context small and read-only.

### 4.6 `src/runtime/survivors.ts`

Owns compaction survivor projection.

Responsibilities:
- select survivor subset from full state
- format `<noesis-state>` payload for `session.compacting`
- inject state file pointer
- exclude ephemeral attention fields except focus summary

### 4.7 `src/runtime/focus.ts`

Owns per-turn focus resolution.

Responsibilities:
- explicit attend override
- workflow-derived fallback
- carry-forward fallback
- minimal default

### 4.8 `src/runtime/consistency.ts`

Owns non-mutating consistency checks.

Responsibilities:
- workflow status vs step status warnings
- stale-era belief review notices
- missing/contradictory cognitive warnings for preamble display

### 4.9 `src/perception/graphify-client.ts`

Owns all Graphify subprocesses.

Responsibilities:
- capability detection and cache
- serialized subprocess execution
- `query`, `update`, `explain`, `path`, `version`
- stale/fresh transitions
- post-refresh stale-belief review trigger surface

Non-goals:
- no belief writes
- no direct state access

### 4.10 `src/perception/graphify-parse.ts`

Owns Graphify output parsing.

Responsibilities:
- parse nodes, relations, confidence, communities, god nodes, surprising connections
- preserve `rawOutput` when parsing is partial

### 4.11 `src/perception/graphify-translate.ts`

Owns Graphify → noesis mapping.

Responsibilities:
- confidence translation
- stale penalty application
- tags/communityScope mapping
- transient `graphFindings` shaping

### 4.12 `src/belief/revise.ts`

Owns AGM-like supersession behavior.

Responsibilities:
- contradiction validation
- dedup no-op on identical content
- supersession chains
- archive vs supersede rules

### 4.13 `src/belief/stale-confidence.ts`

Owns dynamic stale-confidence adjustment for existing graph beliefs.

Responsibilities:
- compute adjusted confidence at read/preamble time
- identify stale-era graph beliefs after refresh
- emit review annotations, not auto-revisions

### 4.14 `src/learning/*`

Owns the learning loop.

Responsibilities:
- candidate capture buffer
- ranking formula
- capped retention/eviction
- promotion support metadata

### 4.15 `src/projection/*`

Owns optional human projection.

Responsibilities:
- collect projection intents during the turn
- batch and coalesce
- write Obsidian notes best-effort
- never affect runtime cognition on failure

---

## 5. Runtime Construction

`createRuntime(projectRoot, pi)` builds one long-lived runtime object with:

- `store`
- `stateManager`
- `graphifyClient`
- `projectionBatcher`
- policy helpers (`buildPreamble`, `buildSurvivors`, `resolveFocus`, `checkConsistency`)

Suggested runtime shape:

```ts
interface NoesisRuntime {
  state: StateManager;
  graphify: GraphifyClient;
  projection: ProjectionBatcher;
  buildPreamble(): string;
  buildSurvivors(): { contextLines: string[]; preserveData: Record<string, unknown> };
  refreshFocus(turnContext: TurnContext): void;
  invalidateAfterCompaction(): void;
}
```

The runtime is the only place where module outputs are assembled into hook/tool behavior.

---

## 6. Tool Wiring

### 6.1 `noesis_attend`

Path: `src/tools/attend.ts`

Reads:
- current attention
- current capability

Writes:
- attention focus/files/queries
- ephemeral `attention.graphFindings`
- optionally graph-derived beliefs only when explicitly committed later, never here

Flow:
1. validate params
2. `state.mutate()` attention fields
3. if `graphQueries` present and capability allows:
   - run Graphify via client
   - parse + translate
   - write ephemeral graph findings into attention-only state/cache
4. `checkpointAttention()` if needed
5. return structured summary to agent

### 6.2 `noesis_believe`

Path: `src/tools/believe.ts`

Reads/writes belief layer, and learning resolution when `type="learning"`.

Flow:
1. validate discriminator branch
2. if `type="learning"`, resolve candidate/entry by `learningId`
3. if contradiction ids supplied, run `belief/revise.ts`
4. persist synchronously via `state.mutate()`
5. enqueue projection intent if decision or resolved learning changed

### 6.3 `noesis_infer`

Path: `src/tools/infer.ts`

Responsibilities:
- create/update hypothesis
- add reasoning steps
- auto-promote confirmed hypothesis to belief

Flow:
1. validate action
2. mutate inference layer
3. if status becomes `confirmed`, create inference-sourced belief at 0.75 with audit back-pointer
4. persist synchronously

### 6.4 `noesis_commit`

Path: `src/tools/commit.ts`

Responsibilities:
- manage workflow/actions
- extend or replace
- explicit workflow status updates
- consistency checks, not orchestration

Flow:
1. validate mode and payload
2. mutate commitment layer
3. preserve completed steps in same array
4. emit consistency warnings if aggregate state conflicts
5. enqueue workflow projection intent

---

## 7. Hook Wiring

### 7.1 `context`

Path: `src/hooks/context.ts`

Role: sole live preamble injector.

Flow:
1. refresh focus through fallback chain
2. compute dynamic stale-confidence adjustments and review notes
3. build preamble from current runtime state
4. prepend one structured message
5. clear one-shot `graphFindings` after successful render

Never:
- runs Graphify subprocesses
- writes durable layers directly

### 7.2 `before_agent_start`

Path: `src/hooks/before-agent-start.ts`

Role: safety-net only.

Flow:
- if normal context path is unavailable/bypassed, inject minimal orientation message
- never duplicate full context-hook preamble during standard flow

### 7.3 `session.compacting`

Path: `src/hooks/session-compacting.ts`

Role: compaction plumbing only.

Flow:
1. build survivor projection from in-memory state
2. include full serialized state in `preserveData.noesis`
3. include pointer to `state.json`
4. no preamble duplication

### 7.4 `session_compact`

Path: `src/hooks/session-compact.ts`

Role: session-boundary cache invalidation.

Flow:
- invalidate runtime in-memory snapshot freshness markers
- next `read()` reloads from disk if needed per boundary policy

### 7.5 `tool_result`

Path: `src/hooks/tool-result.ts`

Role: phase-1 learning capture + mechanical transitions.

Flow:
1. inspect tool result
2. capture learning candidate / minimal failure entry
3. perform safe automatic transitions only when evidence is mechanical
4. persist learning changes synchronously
5. enqueue projection intent only if a projection-relevant mutation occurred

---

## 8. State Flow

### 8.1 Durable write path

```text
Tool/Hook
  -> stateManager.mutate()
  -> in-memory mutation
  -> synchronous saveState()
  -> state.json updated atomically
```

Applies to:
- belief
- inference
- commitment
- learning

### 8.2 Attention path

```text
Tool/Context
  -> stateManager.mutate() attention only
  -> mark attention dirty
  -> checkpointAttention() on explicit boundary
  -> atomic save if dirty
```

### 8.3 Graph perception path

```text
noesis_attend
  -> graphifyClient.query/update
  -> parse/translate
  -> attention.graphFindings (ephemeral)
  -> buildPreamble renders evidence once
  -> graphFindings cleared
  -> no durable belief until noesis_believe
```

### 8.4 Learning path

```text
tool_result
  -> learning candidate/minimal failure capture
  -> preamble surfaces unresolved learning
  -> agent diagnoses
  -> noesis_believe(type=learning, learningId, rootCause, fix)
  -> resolved learning retained + ranked higher
```

### 8.5 Compaction path

```text
session.compacting
  -> survivors.ts selects bounded subset
  -> preserveData.noesis gets full serialized state snapshot
  -> session_compact invalidates runtime freshness
  -> next live turn rebuilds from authoritative disk state
```

---

## 9. Preamble Structure

Implementation order:

1. capability block
2. current work
3. active decisions
4. active beliefs
5. graph evidence / task-relevant notes
6. unresolved hypotheses
7. recent learning
8. consistency/review notes when needed

Token policy:
- section caps enforced independently
- capability block ≤100 tokens
- graph evidence and low-confidence sections are first to trim/gate
- current work and active decisions are never truncated away

---

## 10. Projection Flow

Projection is outside the critical path.

```text
Mutation succeeds
  -> enqueue projection intent
  -> batch by turn
  -> coalesce by artifact path
  -> flush best-effort
  -> log failures only
```

Trigger sources:
- resolved learning
- decision changes
- workflow changes
- explicit session snapshot moments

Never:
- block mutation success
- read from Obsidian
- affect preamble or survivors on failure

---

## 11. Module Dependency Rules

Allowed high-level dependency direction:

```text
schema/util
  -> store, belief, learning, perception
  -> runtime
  -> hooks/tools
  -> index
```

Rules:
- `tools/` and `hooks/` depend on runtime, not on each other
- `store/` depends on schema/util only
- `perception/` never imports hooks or tools
- `projection/` never imports OMP hook code
- `runtime/` may compose all lower layers, but lower layers must not import runtime

---

## 12. What We Are Explicitly Not Building in v1

- no workflow engine
- no DAG executor
- no automatic Graphify watch integration
- no belief auto-reconciliation after graph refresh beyond review flags
- no archive tier for workflow steps
- no persistent graph evidence store beyond ephemeral attention buffer
- no runtime dependence on Obsidian
- no database or background daemon

---

## 13. Immediate Build Order

1. `schema.ts`
2. `store/filesystem-store.ts` + `migrations.ts`
3. `runtime/state-manager.ts`
4. `perception/graphify-client.ts` + parse/translate helpers
5. `belief/revise.ts` and `belief/stale-confidence.ts`
6. `learning/*`
7. `runtime/focus.ts`, `runtime/preamble.ts`, `runtime/survivors.ts`, `runtime/consistency.ts`
8. tool adapters
9. hook adapters
10. projection batcher + obsidian writer
11. `index.ts`

This order minimizes rework because each later layer depends on the contracts established by the earlier ones.

---

## 14. Acceptance Criteria for Implementation Phase

The implementation architecture is correct if:

- one runtime object owns all state mutation
- no hook besides `tool_result` mutates durable cognitive layers
- `context` never runs Graphify subprocesses
- compaction survivors and live preamble are built by different modules from the same source state
- stale graph capability and stale graph belief review are visible in the preamble
- Obsidian failures cannot block tool success
- `state.json` remains the only durable runtime artifact
- every tool and hook can be implemented as a thin adapter over runtime services
