# Architecture Specification

> **Version:** 1.0.1 | **Updated:** 2026-06-24

## Version History

- **v1.0.1** (2026-06-24): Full TypeScript strict-mode compliance — 0 compile errors, 1116/1116 tests passing. Fixed DeepSeek API compatibility, TUI logging pollution, handler timeouts.
- **v1.0.0**: Initial release.

## Overview

omp-noesis is an Oh My Pi extension that adds structured cognitive layers — attention, belief, inference, commitment, and learning — with graph-grounded perception and compaction survival.

## System Context

```
┌────────────────────────────────────────────────────────┐
│                     OMP Core                           │
│  Hooks  |  Compaction  |  Session  |  Tools            │
│────┬──────┬──────────────┬──────────┬──────────┬───────│
│    │      │              │          │          │       │
│  ┌─▼──────▼──────────────▼──────────▼──────────▼─┐   │
│  │              omp-noesis v1.0.1                 │   │
│  │  ┌─────────────────────────────────────────┐  │   │
│  │  │  src/index.ts (entry)                   │  │   │
│  │  │  · 15 tools (8 canonical + 7 aliases)  │  │   │
│  │  │  · 8 hooks registered                   │  │   │
│  │  └─────────────────────────────────────────┘  │   │
│  │  ┌────────┐ ┌──────────┐ ┌──────────┐        │   │
│  │  │Cognition│ │Perceptn │ │ Learning │        │   │
│  │  │(domains)│ │(graphify)│ │(ranking) │        │   │
│  │  └────┬───┘ └────┬─────┘ └────┬─────┘        │   │
│  │  ┌────▼──────────▼────────────▼─────────┐    │   │
│  │  │        Persistence Layer             │    │   │
│  │  │  state.json | migrations             │    │   │
│  │  └──────────────────────────────────────┘    │   │
│  │  ┌──────────────────────────────────────┐    │   │
│  │  │      Context Curation Layer          │    │   │
│  │  │  preamble-builder | consistency      │    │   │
│  │  └──────────────────────────────────────┘    │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
├──────────────────────────────────────────────────────┤
│  External: Graphify CLI | OMP Memory | .omp/noesis/ | Obsidian   │
└──────────────────────────────────────────────────────┘
```

## Module Map

### Entry Point (`src/index.ts`)

Creates the runtime singleton, registers 8 canonical tools (`noesis_attend`, `noesis_believe_fact`, `noesis_believe_decision`, `noesis_infer`, `noesis_commit`, `noesis_state_inspect`, `noesis_sandbox`, `noesis_federate`) plus 7 aliases (`focus_task`, `switch_focus`, `store_memory`, `store_decision`, `test_hypothesis`, `track_workflow`, `read_memory`), and 8 hooks (`session_start`, `context`, `before_agent_start`, `session.compacting`, `tool_result`, `turn_end`, `before_provider_request`, `session_shutdown`). No business logic during load.

### Schema (`src/shared/schema.ts`)

Zod schemas for all state shapes, tool parameters, and internal types. Exports TypeScript interfaces, empty state factory, ID generation, and caps/constants.

### Infrastructure Layer

| Module | Responsibility |
|---|---|
| `filesystem-store.ts` | Atomic read/write of `state.json` |
| `state-manager.ts` | In-memory authority, OCC via UnitOfWork, checkpointing |
| `migrations.ts` | Schema version upgrades |
| `unit-of-work.ts` | Optimistic concurrency control (OCC) |
| `graphify-client.ts` | Graphify subprocess + MCP fallback |
| `graphify-parser.ts` | NL output → structured `GraphFinding` |
| `graphify-delta.ts` | Graph node diff for belief revision auto-reconciliation |
| `graphify-setup.ts` | CLI detection and build invocation |
| `repositories/` | Per-layer repository classes (belief, attention, commitment, inference, learning) |
### Domain Layer

| Domain | Files | Responsibility |
|---|---|---|
| Attention | `attention-domain.ts` | Focus, files, queries, ephemeral findings |
| Belief | `belief-domain.ts`, `revision-strategy.ts`, `confidence-strategy.ts`, `review-strategy.ts`, `grounding-strategy.ts`, `epistemic-strategy.ts` | Facts, decisions, AGM revision, review, graph grounding |
| Inference | `inference-domain.ts` | Hypotheses, reasoning, auto-promotion |
| Commitment | `commitment-domain.ts`, `consistency-strategy.ts` | Workflow, actions, dependency resolution |
| Learning | `learning-domain.ts`, `ranking-strategy.ts`, `eviction-strategy.ts`, `lesson-retrieval.ts` | Capture, ranking, retention, retrieval |
| Compaction | `loss-strategy.ts` | Per-entry compaction fidelity reporting |
| Federation | `federation-domain.ts` | Publish/pull/revise/retract canonical ledger entries |
| Sandbox | `sandbox-domain.ts` | Speculative belief sandboxing (create, explore, merge, discard) |
### Rendering Layer

| Module | Responsibility |
|---|---|
| `preamble-builder.ts` | ≤2000-token context curation |
| `survivor-builder.ts` | Compaction survivor selection |
| `section-formatters.ts` | Per-section Markdown |
| `focus-resolver.ts` | Focus fallback chain |

End-turn eviction is orchestrated by `EndTurnCleanupUseCase` in the application layer.

### Application Layer (Use Cases)

| Use Case | Responsibility |
|---|---|
| `hydrate-from-memory.ts` | Query OMP memory → parse → dedup → import Noesis beliefs at session start |
| `add-belief-fact.ts` | Create belief fact with conflict/contradiction detection |
| `add-belief-decision.ts` | Create belief decision with rationale |
| `revise-belief.ts` | Explicit belief revision with supersession |
| `add-hypothesis.ts` | Create hypothesis in inference layer |
| `confirm-hypothesis.ts` | Transition hypothesis to confirmed |
| `update-hypothesis.ts` | Update hypothesis status (refute/abandon) |
| `add-reasoning-step.ts` | Add reasoning step to inference layer |
| `attend.ts` | Update attention focus with graph perception |
| `capture-learning.ts` | Capture tool results as learning entries |
| `apply-lesson.ts` | Apply a captured lesson as a prevention belief |
| `extend-workflow.ts` / `replace-workflow.ts` / `update-workflow-step.ts` | Workflow lifecycle |
| `end-turn-cleanup.ts` | Eviction orchestration after tool execution |
| `reconcile-with-graph.ts` | Auto-demote orphaned beliefs when graph nodes are removed |
| `resolve-provenance.ts` | Trace fact/decision provenance chain |
| `create-sandbox.ts` / `explore-in-sandbox.ts` / `merge-sandbox.ts` / `discard-sandbox.ts` | Speculative sandbox lifecycle |
| `publish-belief.ts` / `pull-beliefs.ts` / `retract-belief.ts` / `import-ledger.ts` | Multi-agent federation operations |
| `submit-for-review.ts` / `accept-review.ts` / `reject-review.ts` | Human-in-the-loop review cycle |
| `add-planned-action.ts` | Record a planned action in the commitment layer |
### OMP Memory Integration

The OMP memory bridge enables cross-session durability while keeping `state.json` authoritative:

```
Tool/Hook → state.json (authoritative write)
              ↓ (best-effort bridge via retainToOmp)
           OMP memory → hydration at next session start
                           ↓ (optional)
                        Obsidian vault (human-readable projection)
```

**Bridge direction:**

| Operation | Source | Target | Mechanism |
|---|---|---|---|
| Durability write | `noesis_believe_fact` | OMP memory | `runtime.retainToOmp()` — best-effort |
| Durability write | `noesis_believe_decision` | OMP memory | `runtime.retainToOmp()` — best-effort |
| Hydration read | OMP memory | state.json | `HydrateFromMemoryUseCase` at session start |
| Projection write | state.json | Obsidian vault | `vaultStore.push()` — best-effort |

**Key properties:**
- OMP memory entries carry `[noesis/belief]` or `[noesis/decision]` prefix in their content string
- Context string stores `id`, `confidence`, `originalConfidence`, `source`, `tags` as structured key-value pairs
- Hydration uses content-hash deduplication to avoid duplicates

### Vault Layer

| Module | Responsibility |
|---|---|
| `vault-store.ts` | Interface (push, pull, search) |
| `vault-detector.ts` | Backend resolution chain (inline no-op fallback) |
| `obsidian-vault-store.ts` | Markdown + frontmatter projection |
| `obsidian-writer.ts` | Atomic note creation |
| `vault-retry.ts` | On-disk retry buffer |

## Dependency Direction

```
schema/shared → infrastructure, domains, vault → rendering → hooks/tools → index
```

- Tools/hooks never import each other
- Domains never import hooks, tools, rendering, or vault
- No module imports `index.ts`

## State Flows

- **Durable write:** Tool/Hook → `stateManager.mutate()` → in-memory → `saveState()` → `state.json`
- **Durable write (UnitOfWork/OCC):** `stateManager.createUnitOfWork()` → clone state + capture `lastPersisted` → mutate via repository layer → `commit()` verifies `lastPersisted` unchanged → rejects stale writers with `TransactionConflict` error
- **OMP memory bridge (write):** `noesis_believe_fact`/`noesis_believe_decision` → `runtime.retainToOmp()`
  → OMP memory `save()` — best-effort, async, never blocks the tool response
- **Session-start hydration (read):** `session_start` hook → `HydrateFromMemoryUseCase.execute()`
  → OMP memory `search("[noesis/belief]")` + `search("[noesis/decision]")`
  → parse → content-hash dedup → bulk import with capped confidence (≤0.75); original confidence preserved as `originalConfidence`
- **Attention:** `stateManager.mutate()` attention → `checkpointAttention()` → atomic save
- **Graph perception:** `noesis_attend` → Graphify query → parse → `attention.graphFindings`
- **Learning:** `tool_result` → capture → preamble surfaces unresolved → agent diagnoses → `noesis_believe_fact`
- **Compaction:** `session.compacting` → survivor selection → `preserveData.noesis` → rebuild from disk

## Bidirectional Sync Model

### Architecture Rule

Three storage tiers with clear authority:

| Tier | Role | Authority |
|---|---|---|
| **state.json** | Cognitive state authority | Always authoritative — all tools read/write here |
| **OMP Memory** | Cross-session durability channel | Supplements state.json on startup — never overwrites local state |
| **Obsidian vault** | Human-readable projection | Write-only — best-effort, never read for cognition |

### Hydration Flow (Session Start)

```
OMP Core session start
  → session_start hook fires
    → HydrateFromMemoryUseCase.execute()
      → runtime.getMemoryStatus()
      → if searchable:
        → Promise.all([search("[noesis/belief]"), search("[noesis/decision]")])
        → for each entry: parseContext() → contentHash() dedup
        → import as BeliefFact/BeliefDecision with source:"omp-memory"
      → commit via UnitOfWork
```

### Degradation Paths

| State | Behavior |
|---|---|
| OMP memory offline | `getMemoryStatus()` returns `{backend:"off"}` → hydration skipped |
| OMP memory readable but not writable | Hydration proceeds; write bridge silently fails |
| No OMP memory → Obsidian only | Noesis works 100% standalone; vault projection still works |
| OMP memory + Obsidian both available | Full bidirectional sync: state.json ↔ OMP memory ↔ Obsidian |

## Error Recovery

| Scenario | Behavior |
|---|---|
| Corrupt state JSON | Rebuild from `EMPTY_STATE` (parse error caught) |
| State file I/O error | Rethrow — preserve on-disk data |
| Graphify unavailable | `detectCapability()` returns `DEGRADED` — graph queries/builds skipped, preamble shows `[Noesis: DEGRADED — limited operation]` label. Persistence, state authority, and all other systems unaffected. |
| Graphify timeout | Return error, agent decides retry |
| Vault write fail | Buffer to `vault-retry.json`, retry next turn |
| Schema mismatch | Run migration pipeline or fail |
| OMP memory write bridge fails | Caught silently — non-critical, state.json is authoritative |
| OMP memory search fails | Returns `[]` — hydration gracefully skips |
| OMP memory backend unavailable | No hydration, no write bridge — Noesis operates standalone |
| Transaction conflict (OCC) | `UnitOfWork.commit()` detects stale `lastPersisted` → throws `"Transaction conflict"`. Caller must discard stale UoW, open fresh one, and retry. No partial writes or data corruption. |

Security: all Graphify commands use `execFile`, paths validated to project tree, state writes atomic (temp → fsync → rename), no network in core path.

## Recommendation Coverage

The external analysis document (`docs/external/noesis-analysis-and-recommendations.md`) contains 10 recommendations from a third-party engineering review. This matrix maps each to the current code path, implementation status, and any noted threat model:

| # | Recommendation | Status | Code Path / Documentation | Notes |
|---|---|---|---|---|
| 1 | **Epistemic Status Tags** | Implemented | `BeliefFact.epistemicStatus`, `BeliefDecision.epistemicStatus` in `src/shared/schema.ts`; `"certain"\|"probable"\|"speculative"\|"deprecated"\|"contradicted"` | Status used in preamble context selection and revision; confidence thresholds separate from epistemic modality |
| 2 | **Cognitive Observability** | Implemented | `noesis_state_inspect` tool (`src/tools/state-inspect-tool.ts`) with queries: `active_beliefs`, `active_decisions`, `unresolved_hypotheses`, `relevant_learning`, `current_workflow`, `full_state_digest`, `attention`, `token_profile`, `compaction_loss`, `compaction_history`, `provenance`, `search` | The `noesis_state_inspect` tool is the OMP-native command the recommendation explicitly offered as an alternative to a separate dev server. All requested observability surfaces — belief provenance chains (`provenance`), attention coverage (`attention`), compaction loss reports (`compaction_loss`/`compaction_history`) — are implemented as query modes. |
| 3 | **Compaction with Semantic Loss Metrics** | Implemented | `computeCompactionResult()` in `src/domains/compaction/loss-strategy.ts` produces structured per-entry evicted/degraded data with reason codes; surfaced via `noesis_state_inspect` `compaction_loss`/`compaction_history` queries; unit+property tests in `tests/unit/compaction/` and `tests/property/` | Per-entry tracked via `CompactionResult.degraded` (truncated, confidence_drop) and `CompactionResult.evicted` (capacity, stale, low_confidence, superseded) — replaces the proposed `fidelityLoss` field |
| 4 | **Speculative Belief Sandboxing** | Implemented | `noesis_sandbox` tool (`src/commands/sandbox-tool.ts`, `src/domains/sandbox-domain.ts`) — `create`, `explore`, `merge`, `discard`, `list` | Sandbox beliefs isolated from main belief base until explicit merge; mirrors the proposed `git branch for cognition` pattern |
| 5 | **Graphify → Belief Revision Pipeline** | Implemented | `ReconcileWithGraphUseCase` (`src/application/use-cases/reconcile-with-graph.ts`) auto-runs at session start via `session-start-hook.ts`; `graphify-delta.ts` computes node diffs; `grounding-strategy.ts` detects orphaned beliefs and demotes epistemic status + confidence; `tests/behavioral/graph-delta-revision.test.ts` covers the full pipeline | Auto-reconciliation at session start: when graph nodes are removed, orphaned beliefs are automatically demoted (certain→probable→speculative, confidence -0.15). No manual commit needed. See [GRAPHIFY_CONTRACT.md](GRAPHIFY_CONTRACT.md) § Auto-Reconciliation |
| 6 | **Learning Loop Schema** | Implemented | `LearningEntry` in `src/shared/schema.ts` with `trigger`, `diagnosis`, `intervention`, `prevention`, `retrievalKeys` fields | Full schema matches the proposed `Lesson` interface; ranking via `ranking-strategy.ts`, eviction via `eviction-strategy.ts` |
| 7 | **Human-in-the-Loop Calibration** | Implemented | `BeliefFact.reviewRequired` flag; `shouldReview()` strategy gates on confidence≥0.85 + epistemic status + source (`src/domains/belief/review-strategy.ts`); auto-flagging in `noesis_believe_fact` tool; `SubmitForReviewUseCase`/`AcceptReviewUseCase`/`RejectReviewUseCase`; `/noesis:review` slash command (`src/commands/review-command.ts`) with `pending`, `accept <id>`, `reject <id>`; `tests/behavioral/human-review-loop.test.ts` | Flagging is advisory by design — beliefs commit before review completes. Hard blocking gate (pause until reviewed) is a deliberate `ponytail:` deferral for unsupervised/multi-agent deployments. |
| 8 | **Token Economics Dashboard** | Implemented | `/noesis:token-profile` CLI command (`src/commands/token-profile-command.ts`) displays budget per category; `token-accountant.ts` (`src/rendering/`) classifies sections into core/session/working/reserve and tracks usage against budget; `noesis_state_inspect` `token_profile` query shows per-section token estimates | CLI-based dashboard with per-category budget breakdown; reactive by design. A real-time streaming dashboard is a `ponytail:` enhancement for future observability needs. |
| 9 | **Property-Based Testing** | Implemented | `tests/property/agm-postulates.test.ts` uses fast-check to fuzz AGM postulates K\*1–K\*6 (closure, consistency, inclusion, preservation, supersession immutability); `tests/property/compaction-idempotence.test.ts` validates compaction invariants; `tests/property/eviction-invariants.test.ts` covers eviction edge cases; generators in `tests/helpers/generators.ts` | AGM compliance validated via property-based random perturbation with fast-check, not just hand-crafted sequences. Covers all core postulates. |
| 10 | **Multi-Agent Federation** | Implemented | `CanonicalLedger` schema (`src/domains/federation/schema.ts`); `federation-domain.ts` with `publishToLedger`, `pullFromLedger`, `reviseLedgerEntry`, `retractFromLedger`, `importFromLedger`, `serializeLedger`/`parseLedger` (JSONL); `noesis_federate` tool (`src/tools/federate-tool.ts`); `ImportLedgerUseCase`; `tests/behavioral/federation-lifecycle.test.ts` | Canonical ledger with JSONL persistence exists (`initializeLedger`, `serializeLedger`). Federation is ad-hoc via publish/pull; a git-tracked ledger with signed entries is a `ponytail:` enhancement for formal multi-agent deployments. |

### Status Key

| Status | Meaning |
|---|---|
| **Implemented** | Feature is fully coded, tested, and documented |
| **Partial** | Core mechanism exists but falls short of the recommendation's full scope |
| **Not implemented** | Feature is absent; documented as known gap with upgrade path |

### Design Trade-Offs

All 10 recommendations are implemented in code with associated tests. The following items reflect conscious design choices, not unimplemented features:

- **Recommendation 7** (human-in-the-loop): The review lifecycle (flag via `reviewRequired`, accept/reject use cases, `/noesis:review` command) is fully implemented. The review gate is advisory by design — beliefs commit before human review completes, appropriate for a single-agent developer-supervised context. A hard blocking gate (pause until reviewed) is a `ponytail:` enhancement for unsupervised or multi-agent deployments.
- **Recommendation 8** (token economics): The `/noesis:token-profile` CLI command and `noesis_state_inspect` `token_profile` query provide on-demand per-category budget analysis. A real-time streaming dashboard is a `ponytail:` enhancement for future observability needs.
- **Recommendation 10** (multi-agent federation): The canonical ledger (`CanonicalLedger` schema, JSONL serialization) with publish/pull/revise/retract/import lifecycle is implemented. A git-tracked ledger with signed entries is a `ponytail:` enhancement for formal multi-agent deployments.
