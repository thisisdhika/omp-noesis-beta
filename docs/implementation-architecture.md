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
  index.ts                    — extension registration (pi.registerTool, pi.on hooks)
  schema.ts                   — TypeScript types + zod schemas
  infrastructure/             — disk IO, Graphify transport, Obsidian projection writer
    graphify-client.ts        — Graphify subprocess management (capability detection, query/update/explain/path)
    graphify-engine.ts        — Graphify → noesis translation (confidence mapping, stale penalty, god nodes)
    graphify-parser.ts        — Graphify output parsing (nodes, relations, confidence, communities)
    filesystem-store.ts       — Disk IO (read/write state.json, migrations)
    state-manager.ts          — In-memory state authority (read(), mutate(), checkpointAttention())
    obsidian-writer.ts        — Obsidian projection writer (batch flush)
    migrations.ts             — Schema migrations
  tools/                      — OMP tool adapters (thin, delegate to domain modules)
    attend-command.ts         — noesis_attend
    believe-command.ts        — noesis_believe
    infer-command.ts          — noesis_infer
    commit-command.ts         — noesis_commit
    focus-command.ts          — noesis_focus
    vault-search-command.ts   — noesis_vault_search
    tool-result.ts            — tool result type helper
  shared/                     — Pure helpers, no business logic
    tokens.ts                 — Token estimation
    simple-yaml.ts            — YAML read/write
    text.ts                   — Text utilities
    clone.ts                  — State cloning
    paths.ts                  — Path helpers
    time.ts                   — Time/ISO helpers
    ids.ts                    — ID generation
  rendering/                  — Preamble and survivor rendering
    preamble-builder.ts       — buildPreamble() — canonical preamble renderer
    survivor-builder.ts       — buildSurvivors() — compaction survivor set
    section-formatters.ts     — Per-section formatters (beliefs, decisions, learning, etc.)
    focus-resolver.ts         — resolveFocus() — focus resolution fallback chain
    state-cleanup.ts          — stripTransientState(), evictOverCap(), evictStale()
  domains/                    — Cognitive domain logic (own their layer's state mutations)
    belief/
      belief-domain.ts        — addFact, addDecision, resolveLearning, getActiveFacts/Decisions
      revision-strategy.ts    — reviseFact, reviseDecision (AGM supersession)
      confidence-strategy.ts  — translateGraphConfidence, applyStalePenalty, isPreambleEligible
    learning/
      learning-domain.ts      — addLearning, getRankedLearning, applyRetentionPolicy
      ranking-strategy.ts     — rankLearning() scoring
      eviction-strategy.ts    — Eviction logic
    commitment/
      commitment-domain.ts    — extendWorkflow, replaceWorkflow, updateWorkflowStatus, getCurrentStep, getNextStep
      consistency-strategy.ts — checkConsistency()
    inference/
      inference-domain.ts     — addHypothesis, confirmHypothesis, getUnresolvedHypotheses, etc.
    attention/
      attention-domain.ts     — setFocus, setGraphQueries, setFiles, storeGraphFindings, clearGraphFindings
  hooks/                      — OMP lifecycle hook adapters
    context-hook.ts           — context hook: preamble injection
    before-agent-start.ts      — before_agent_start hook: minimal safety-net
    compaction-hook.ts        — session.compacting hook: survivor + preserveData
    tool-result-hook.ts       — tool_result hook: learning capture
    turn-end.ts               — turn_end hook: per-turn eviction (undocumented in current doc)
  vault/                      — Vault store backends
    vault-store.ts            — VaultStore interface
    noop-vault-store.ts       — NoopVaultStore (no-op impl, Obsidian optionality guarantee)
    vault-detector.ts         — detectVault() — backend resolution
    vault-retry.ts            — VaultRetry — projection retry buffer
    obsidian-vault-store.ts   — ObsidianVaultStore — Markdown+frontmatter projection
    obsidian-merger.ts        — mergeVaultPull() — conflict resolution for pulled artifacts
    mnemopi-vault-store.ts    — MnemopiVaultStore — SQLite-backed
    hindsight-vault-store.ts  — HindsightVaultStore — Hindsight API-backed
    local-vault-store.ts      — LocalVaultStore — MEMORY.md append-only
  state/
    state-cache.ts            — In-memory state cache
  commands/
    init-command.ts           — OMP init command handler
```

### Why this split

- `infrastructure/` owns disk persistence, Graphify transport, and Obsidian projection.
- `tools/` and `hooks/` stay thin adapters over domain and rendering modules.
- `domains/` isolates cognitive policy (belief, learning, commitment, inference, attention) from transport and rendering.
- `rendering/` owns preamble and survivor construction.
- `shared/` contains only boring helpers (no business logic).
- `vault/` abstracts projection backends behind the VaultStore interface.
- `commands/` owns OMP init and project-level setup.
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
- infrastructure, rendering, domains, vault, and state code depend on this; schema depends on nothing else

### 4.3 `src/infrastructure/filesystem-store.ts`

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

### 4.4 `src/infrastructure/state-manager.ts`

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

### 4.5 `src/rendering/preamble-builder.ts`

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

### 4.6 `src/rendering/survivor-builder.ts`

Owns compaction survivor projection.

Responsibilities:
- select survivor subset from full state
- format `<noesis-state>` payload for `session.compacting`
- inject state file pointer
- exclude ephemeral attention fields except focus summary

### 4.7 `src/rendering/focus-resolver.ts`

Owns per-turn focus resolution.

Responsibilities:
- explicit attend override
- workflow-derived fallback
- carry-forward fallback
- minimal default

### 4.8 `src/domains/commitment/consistency-strategy.ts`

Owns non-mutating consistency checks.

Responsibilities:
- workflow status vs step status warnings
- stale-era belief review notices
- missing/contradictory cognitive warnings for preamble display

### 4.9 `src/infrastructure/graphify-client.ts`

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

### 4.10 `src/infrastructure/graphify-parser.ts`

Owns Graphify output parsing.

Responsibilities:
- parse nodes, relations, confidence, communities, god nodes, surprising connections
- preserve `rawOutput` when parsing is partial

### 4.11 `src/infrastructure/graphify-engine.ts`

Owns Graphify → noesis mapping.

Responsibilities:
- confidence translation
- stale penalty application
- tags/communityScope mapping
- transient `graphFindings` shaping

### 4.12 `src/domains/belief/revision-strategy.ts`

Owns AGM-like supersession behavior.

Responsibilities:
- contradiction validation
- dedup no-op on identical content
- supersession chains
- archive vs supersede rules

### 4.13 `src/domains/belief/confidence-strategy.ts`

Owns dynamic stale-confidence adjustment for existing graph beliefs.

Responsibilities:
- compute adjusted confidence at read/preamble time
- identify stale-era graph beliefs after refresh
- emit review annotations, not auto-revisions

### 4.14 `src/domains/learning/*`

Owns the learning loop.

Responsibilities:
- candidate capture buffer
- ranking formula
- capped retention/eviction
- promotion support metadata

### 4.15 `src/infrastructure/obsidian-writer.ts`

Owns low-level Obsidian note creation.

Responsibilities:
- `writeObsidianNote(vaultPath, note)`: atomic write (temp → fsync → rename)
- builds YAML frontmatter with `type`, `status`, and arbitrary metadata
- slugifies titles to 48-char filenames
- logs warnings on failure, never throws

Note: projection intent collection, batching, and turn-boundary flush are owned by the vault backends in `src/vault/*`; this module only handles the raw file write.



### 4.16 `src/hooks/*`

Owns OMP lifecycle hook adapters — thin handlers that wire domain logic into OMP hook points.

Files:

- `context-hook.ts` — `context` hook: refreshes focus, builds and injects preamble. The sole live preamble injector.
- `before-agent-start.ts` — `before_agent_start` hook: minimal safety-net fallback. Emits a 1-2 sentence focus reminder only when the context hook was not invoked (bare CLI mode or context hook failure). Never emits a full preamble.
- `compaction-hook.ts` — `session.compacting` hook: builds survivor projection, includes full serialized state in `preserveData.noesis`, invalidates runtime freshness markers.
- `tool-result-hook.ts` — `tool_result` hook: phase-1 learning capture (candidate/minimal failure entry) and mechanical automatic transitions. Projection intent enqueueing is deferred.
- `turn-end.ts` — `turn_end` hook: per-turn eviction (stale/over-cap items), pushes evicted artifacts to vault store via VaultRetry, coordinates with compaction to avoid double-eviction.

Non-goals:
- no preamble construction outside `context-hook.ts`
- no vault writes on the critical path

### 4.17 `src/domains/*`

Owns cognitive domain logic — each domain owns its layer's state mutations and encapsulates domain-specific strategies. Domains never import hooks, tools, rendering, or vault code.

**`domains/attention/`** — Owns attention layer mutations:
- `attention-domain.ts` — `setFocus()`, `setGraphQueries()`, `setFiles()`, `storeGraphFindings()`, `clearGraphFindings()`.

**`domains/belief/`** — Owns belief layer, revision, and confidence:
- `belief-domain.ts` — `addFact()`, `addDecision()`, `resolveLearning()`, `getActiveFacts()`, `getActiveDecisions()`.
- `revision-strategy.ts` — `reviseFact()`, `reviseDecision()`. AGM supersession: contradiction validation, dedup no-op, supersession chains, archive vs supersede rules.
- `confidence-strategy.ts` — `translateGraphConfidence()`, `applyStalePenalty()`, `isPreambleEligible()`. Dynamic stale-confidence adjustment; identifies stale-era graph beliefs and emits review annotations, never auto-revisions.

**`domains/commitment/`** — Owns commitment/workflow layer:
- `commitment-domain.ts` — `extendWorkflow()`, `replaceWorkflow()`, `updateWorkflowStatus()`, `getCurrentStep()`, `getNextStep()`.
- `consistency-strategy.ts` — `checkConsistency()`: workflow status vs step status warnings, stale-era belief review notices, missing/contradictory cognitive warnings.

**`domains/inference/`** — Owns inference layer:
- `inference-domain.ts` — `addHypothesis()`, `confirmHypothesis()`, `getUnresolvedHypotheses()`, etc.

**`domains/learning/`** — Owns learning capture, ranking, and eviction:
- `learning-domain.ts` — `addLearning()`, `getRankedLearning()`, `applyRetentionPolicy()`.
- `ranking-strategy.ts` — `rankLearning()` scoring formula.
- `eviction-strategy.ts` — Eviction logic: removes stale/over-cap entries.

### 4.18 `src/vault/*`

Owns the vault store abstraction layer — a pluggable backend for pushing cognitive artifacts to long-term memory and pulling them back on session start.

**Files:**

- `vault-store.ts` — `VaultStore` interface: `push(artifact)`, `pull(projectPath, options)`, `search(query, projectPath, maxResults)`, `validate()`.
- `noop-vault-store.ts` — `NoopVaultStore`: accepts everything, returns nothing. Enables Obsidian optionality: callers never branch on vault availability.
- `obsidian-vault-store.ts` — `ObsidianVaultStore`: persists artifacts as frontmatter-markdown files under `<vault-root>/Noesis/noesis-<kind>-<id>.md`.
- `obsidian-merger.ts` — `mergeVaultPull()`: merges pulled vault artifacts into in-memory state using conflict rules (state wins for beliefs; newer timestamp wins for decisions; vault trust discount capped at 0.80 confidence).
- `vault-detector.ts` — `detectVault(root)`: resolution order — project config `noesis.obsidianVaultPath` → `.obsidian/` directory → OMP `memory.backend` setting (`local`, `mnemopi`, `hindsight`) → `NoopVaultStore` fallback.
- `vault-retry.ts` — `VaultRetry`: on-disk retry buffer at `.omp/noesis/vault-retry.json`. `enqueue()` buffers failed pushes, `flush()` replays them in order.
- `local-vault-store.ts` — `LocalVaultStore`: append-only `MEMORY.md` file. Simplest dev fallback.
- `mnemopi-vault-store.ts` — `MnemopiVaultStore`: SQLite-backed, `.omp/noesis/mnemopi.sqlite`. Dev-mode structured persistence.
- `hindsight-vault-store.ts` — `HindsightVaultStore`: Hindsight API-backed, optional cloud semantic-memory layer.

### 4.19 `src/commands/init-command.ts`

Owns the `noesis init` command handler.

Responsibilities:
- creates or updates `.omp/config.yml` with recommended noesis compaction settings
- settings written: `compaction.strategy: "context-full"`, `compaction.autoContinue: true`, `compaction.thresholdTokens: 160000`
- reads existing config, merges, normalizes — does not overwrite user settings
- OMP settings like `reserveTokens`, `keepRecentTokens`, `idleThresholdTokens` are NOT written by this command; they remain at OMP defaults


### 4.20 `src/state/state-cache.ts`

Owns preamble caching between state mutations.

Responsibilities:
- `PreambleCache`: caches `buildPreamble()` output keyed on `state.stateVersion.hash`
- `getOrBuild(state, builder)`: returns cached preamble if hash matches, otherwise invokes builder
- `invalidate()`: forces next rebuild (called after compaction)
- `getSubagentOrBuild(state, taskFilter, builder)`: same cache pattern for subagent-specific preamble texts, keyed by `hash:taskFilter`


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

Path: `src/tools/attend-command.ts`

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

Path: `src/tools/believe-command.ts`

Reads/writes belief layer, and learning resolution when `type="learning"`.

Flow:
1. validate discriminator branch
2. if `type="learning"`, resolve candidate/entry by `learningId`
3. if contradiction ids supplied, run `src/domains/belief/revision-strategy.ts`
4. persist synchronously via `state.mutate()`
5. enqueue projection intent if decision or resolved learning changed

### 6.3 `noesis_infer`

Path: `src/tools/infer-command.ts`

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

Path: `src/tools/commit-command.ts`

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

Path: `src/hooks/context-hook.ts`

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

Role: minimal safety-net only.

Flow:
- inject a 1-2 sentence focus reminder when the context hook was not invoked (e.g., bare CLI mode or context hook failure)
- never emit a full preamble — prevents duplicate preamble injection
- never run Graphify subprocesses or compute stale-confidence adjustments

### 7.3 `session.compacting`

Path: `src/hooks/compaction-hook.ts`

Role: compaction plumbing only.

Flow:
1. build survivor projection from in-memory state via `src/rendering/survivor-builder.ts`
2. include full serialized state in `preserveData.noesis`
3. include pointer to `state.json`
4. no preamble duplication
5. invalidate runtime in-memory snapshot freshness markers after compaction

### 7.4 `tool_result`

Path: `src/hooks/tool-result-hook.ts`

Role: phase-1 learning capture + mechanical transitions.

Flow:
1. inspect tool result
2. capture learning candidate / minimal failure entry
3. perform safe automatic transitions only when evidence is mechanical
4. persist learning changes synchronously
5. enqueue projection intent only if a projection-relevant mutation occurred (deferred to turn boundary)

### 7.5 `turn_end`

Path: `src/hooks/turn-end.ts`

Role: per-turn eviction and vault archival.

Flow:
1. runs `evictStale()` (removes non-active facts, decisions, resolved hypotheses) and `evictOverCap()` (trims lowest-ranked items per-layer) inside a single `state.mutate()` block
2. converts every evicted item — facts, decisions, learning entries, hypotheses, commitment actions — into `VaultArtifact` payloads
3. pushes all evicted artifacts to the vault store; if a push fails the artifact is buffered via `VaultRetry.enqueue()`
4. coordinates with `session.compacting` to avoid double-eviction: compaction hook invalidates runtime freshness markers, so the next turn's eviction operates on the reloaded compacted state which has already been trimmed
5. errors are caught and logged — the hook never crashes the turn

This is why `compaction-hook.ts` does not re-run eviction on the same items: eviction happens on every turn boundary, compaction only serialises the survivor set.
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
  -> rendering/survivor-builder.ts selects bounded subset
  -> preserveData.noesis gets full serialized state snapshot
  -> compaction-hook.ts invalidates runtime freshness markers
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

Allowed high-level dependency direction:

```text
schema/shared
  -> infrastructure, domains, vault
  -> rendering
  -> hooks/tools/commands
  -> index
```

Rules:
- `tools/` and `hooks/` depend on rendering and domains, not on each other
- `infrastructure/` depends on schema/shared only
- `domains/` never imports hooks or tools
- `rendering/` depends on domains and shared only
- `vault/` depends on schema/shared only
- `commands/` depends on infrastructure, not on hooks or tools
- `index.ts` may compose everything, but no other module imports `index.ts`

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

1. `schema.ts`
2. `infrastructure/filesystem-store.ts` + `infrastructure/migrations.ts`
3. `infrastructure/state-manager.ts`
4. `infrastructure/graphify-client.ts` + parser + engine
5. `domains/belief/revision-strategy.ts` and `domains/belief/confidence-strategy.ts`
6. `domains/learning/*`
7. `rendering/focus-resolver.ts`, `rendering/preamble-builder.ts`, `rendering/survivor-builder.ts`, `domains/commitment/consistency-strategy.ts`
8. tool adapters (`tools/attend-command.ts`, `tools/believe-command.ts`, etc.)
9. hook adapters (`hooks/context-hook.ts`, `hooks/before-agent-start.ts`, `hooks/compaction-hook.ts`, `hooks/tool-result-hook.ts`, `hooks/turn-end.ts`)
10. `infrastructure/obsidian-writer.ts` + vault backends
11. `index.ts`

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
