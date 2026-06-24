# Testing Strategy

> **Version:** 1.0.1 | **Updated:** 2026-06-24

## Philosophy

> 300% coverage means three independent testing layers, each at 100% coverage of its respective scope.

Traditional line coverage measures execution. Product coverage measures behaviors verified. Noesis requires both.

## Three Layers

| Layer | Scope | Target |
|---|---|---|
| **Unit** `tests/unit/` | Domain logic, pure functions, strategies | 100% of branches |
| **Integration** `tests/integration/` | Tool + hook wiring, persistence, Graphify client | 100% of paths |
| **Behavioral** `tests/behavioral/` | Agent simulation, compaction survival, learning | 100% of behaviors |

## Running Tests

```bash
bun test --isolate                     # All layers (coverage via --coverage flag or package.json)
bun test --isolate tests/unit          # Unit only
bun test --isolate tests/integration   # Integration only
bun test --isolate tests/behavioral    # Behavioral only
bun test --isolate --coverage          # With coverage
bun test --isolate --watch             # Watch mode
bun test --isolate tests/behavioral/compaction-survival.test.ts  # Single file
```

The `package.json` scripts (`bun run test`, `bun run test:unit`, etc.) all include `--isolate` by default.

## Unit Tests

Pattern: Arrange-Act-Assert with mocked state.

Key coverage areas:
- `revision-strategy.ts`: supersession chains, deduplication (K\*6), contradiction scope
- `confidence-strategy.ts`: Graphify mapping, stale penalty
- `ranking-strategy.ts`: recency decay, task relevance, failure multiplier
- `eviction-strategy.ts`: over-cap trimming, stale removal
- `commitment-domain.ts`: dependency resolution, status transitions
- `preamble-builder.ts`: section ordering, trim strategy
- `focus-resolver.ts`: fallback chain
- `graphify-parser.ts`: output parsing and resilience
- Various vault stores: atomic write, backend resolution
- `hydrate-from-memory.ts`: content-hash dedup, confidence capping (0.75) with originalConfidence preservation, context parsing, graceful degradation
- `filesystem-store.ts` / `state-manager.ts`: atomic write protocol, UnitOfWork OCC (optimistic concurrency)

### Graphify v1 Unit Coverage

- Retrieval-before-read: `noesis_attend(graphQueries)` must query Graphify before file reads
- Stale penalty: stale INFERRED evidence penalized at commit time
- Freshness metadata: stale-hours propagate into preamble
- Parse resilience: malformed JSON → warning + empty findings
- Provenance: graph findings keep query/timestamp context

## Integration Tests

Pattern: mock OMP's `ExtensionAPI`, mock Graphify CLI with fixtures, use temp dirs for state file.

Key coverage areas:
- Tool execution: `noesis_attend`, `noesis_believe_fact`, `noesis_believe_decision`, `noesis_infer`, `noesis_commit`, `noesis_state_inspect`
- Hook behavior: context injection, double-preamble guard, compaction survivor, tool-result capture, turn-end eviction
- Persistence: atomic write, migration path
- Vault: backend resolution, note creation and search
- **OCC conflict detection**: concurrent `UnitOfWork` on stale `lastPersisted` → `"Transaction conflict"` rejection, state unchanged
- **OMP memory hydration**: `HydrateFromMemoryUseCase` with mocked backend, cap at 0.75 with originalConfidence preservation, dedup by content hash

## Behavioral Tests

Pattern: simulate full agent sessions with turn sequences.

Key coverage:
- **Compaction survival**: 20 turns, compaction fires, new session — beliefs/decisions/workflow intact
- **Learning prevention**: agent fails → captures learning → next session doesn't repeat
- **Belief revision**: fact A → contradictory fact B → A superseded, not deleted
- **Graceful degradation**: Graphify missing → agent still functions (DEGRADED mode)
- **Vault projection**: learning resolved → turn ends → artifact in vault
- **Cross-session recall**: session 1 commits → session 2 recalls
- **Double-preamble guard**: both hooks fire → only one preamble injected
- **OMP memory hydration**: OMP entries → parsed → deduped → imported with confidence ≤ 0.75, originalConfidence preserved for roundtrip fidelity
- **Graceful degradation (memory)**: OMP memory offline/not searchable/search failure → 0 imports without error

## Coverage Targets

| Metric | Target |
|---|---|
| Function coverage | ≥ 94% |
| Line coverage | ≥ 96% |
| Branch coverage (unit) | 100% |
| Path coverage (integration) | 100% |
| Behavioral coverage | 100% of specified behaviors |

## Current Status

```bash
bun test --isolate --coverage
```
| Suite | Result |
|---|---|
| Tests | ~1120 pass (≤2 known non-blocking failures) |
| Function coverage | ~86% |
| Line coverage | ~91% |

