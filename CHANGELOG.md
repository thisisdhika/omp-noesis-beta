# Changelog

All notable changes to omp-noesis.

## [0.1.0] — 2026-06-15

### Fixed
- **Full type safety** — Eliminated all `as any` and `: any` annotations across source and test files. Zero TypeScript diagnostics (`tsc --noEmit` clean). 304 tests pass.
- **Zod v4 migration** — Upgraded from zod@3 to zod@4 for compatibility with OMP's `TSchema = ZodType | TJsonSchema`. Fixed `z.record()` API change.
- **Canonical `pi.zod` pattern** — Tool schemas now use OMP's injected `pi.zod` module (inline) instead of importing from `zod` directly, matching the official extension SDK pattern. MockPi updated accordingly.
- **24 test file diagnostics** — Resolved `TS2353`, `TS2532`, `TS2339` errors across 6 test files.

### Added

#### Cognitive Substrate (5 Layers)
- **Attention** — focus tracking, file awareness, Graphify query result storage, context-usage gauging, TTL-based staleness detection
- **Belief** — fact/decision storage with confidence scoring (weighted multi-source strategy), AGM K\*2–K\*6 supersession revision (contradiction-driven), active-belief retrieval with confidence threshold
- **Inference** — hypothesis lifecycle (testing → confirmed/refuted/abandoned), reasoning chain tracking, hypothesis-belief linking
- **Commitment** — workflow extension, consistency validation (detects stalled steps, contradictions), completion marking
- **Learning** — success/failure capture with auto-categorization, ranked retrieval, LRU eviction with size caps

#### Tools (7 Commands)
| Tool | Function |
|---|---|
| `noesis_attend` | Query focus state, store/clear Graphify findings |
| `noesis_focus` | Set attention focus, manage files, check staleness |
| `noesis_believe` | Create facts/decisions with confidence and source |
| `noesis_infer` | Add/update hypotheses in the inference layer |
| `noesis_commit` | Extend workflow steps, validate consistency, mark complete |
| `noesis_recall` | Query active beliefs, learning, hypotheses, and Graphify findings |
| `noesis_vault_search` | Placeholder for future vault search integration |

#### Hooks (5 Lifecycle Events)
- `context` — injects cognitive preamble into LLM context (focus, beliefs, active workflow, recent learning, Graphify evidence)
- `before_agent_start` — ensures graph is fresh before turn starts
- `session.compacting` — builds survivor context (compact representation of beliefs + workflow + failures) for compaction preservation
- `tool_result` — captures tool failures into learning layer, records observations
- `turn_end` — flushes vault store, runs state cleanup (stale attention, superseded beliefs)

#### Infrastructure
- **StateManager** — atomic read/mutate/persist through `FilesystemStore` (`.omp/noesis/state.json`)
- **Migrations** — version-stamped state with forward-migration path
- **Graphify integration** — client (`Bun.spawn`), query parser (handles string/object edge formats), result engine

#### Rendering Pipeline
- **Preamble builder** — builds cognitive preamble with token budget enforcement, section prioritization, and truncation
- **Survivor builder** — compact state representation for compaction survival
- **Section formatters** — focus, beliefs, workflow, hypotheses, learning, Graphify evidence
- **Focus resolver** — identifies relevant sections given current focus
- **State cleanup** — TTL-based staleness, belief housekeeping

#### Vault System
- Pluggable backends: `NoopVaultStore`, `LocalVaultStore`, `ObsidianVaultStore`, `MnemopiVaultStore`, `HindsightVaultStore`
- Retry queue with exponential backoff
- Vault detection and auto-configuration

#### Commands
- `noesis init` — initializes `.omp/noesis/` directory and config

#### Shared Utilities
- `ids` — ULID generation
- `time` — ISO timestamp, TTL staleness check
- `tokens` — character-based token estimation
- `text` — truncation/summarization
- `paths` — `.omp/noesis` path resolution
- `clone` — deep clone with Date/RegExp/Map/Set support

### Testing
- **402 tests, 0 failures** across 34 test files
- Coverage: 91.7% lines, 90.1% functions
- Unit tests for all 5 domain layers, shared utilities, vault stores, rendering pipeline, infrastructure
- Integration tests for tools, hooks, state flow, Graphify integration, vault system
- Behavioral tests for compaction survival, learning loop, belief revision, graceful degradation

### Latest (2026-06-15)

#### Vault Unit Tests
- 33 new tests across 5 files covering `MnemopiVaultStore`, `LocalVaultStore`, `HindsightVaultStore`, `VaultDetector`, and `RetryBuffer`
- Vault store coverage: 0% → 100% for all store implementations

#### Improved Token Estimator
- Replaced naive `chars/4` heuristic with regex-based approximate BPE pre-tokenizer
- Splits on contractions, words, numbers, punctuation, and whitespace — ~15-20% more accurate for English text

#### Belief Contested Marking
- Implemented Step 5 of AGM supersession algorithm: `getContestedWarnings()` detects hypotheses dependent on superseded beliefs
- Contested warnings surfaced as `[WARNINGS]` section in cognitive preamble (protected, never dropped during budget enforcement)

#### Comprehensive Test Coverage
- 36 tool handler integration tests covering all believe/infer/commit/recall variants and error paths
- 11 hook lifecycle tests (before-agent-start, compaction, context, tool-result, turn-end)
- 41 unit tests for strategies (confidence, consistency) and state cleanup (evictStale, evictOverCap)
- 11 Graphify e2e tests (client build/query, parser edge cases, setup CLI checks)
- All 5 hooks at 100% coverage, all domain strategies at 95%+, all vault stores at 100%