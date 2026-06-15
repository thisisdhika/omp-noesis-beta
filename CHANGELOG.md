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
- **536 tests, 0 failures** across 41 test files
- Coverage: 94.99% lines, 91.93% functions
- Unit tests for all 5 domain layers, shared utilities, vault stores, rendering pipeline, infrastructure
- Integration tests for tools, hooks, state flow, Graphify integration, vault system
- Behavioral tests for compaction survival, learning loop, belief revision, graceful degradation

### Latest (2026-06-15)

#### Type Safety Hardening
- Eliminated all unnecessary `as T` and `as Record<string, unknown>` type assertions across source and test files
- Replaced with proper type narrowing, type guards (`isRecord()`), and zod runtime validation at boundaries
- Added `cloneState()` helper in test fixtures to avoid `structuredClone(EMPTY_STATE) as NoesisState` repetition
- Unified `MockPi` interface and `toExtensionAPI()`/`castToExtensionAPI()` bridge functions in test helpers
- Zero `: any` or `as any` annotations. Remaining `as` casts are at true boundary points only

#### Code Quality — Deduplication
- Unified 7 duplicated test helpers: `MockPi` interface, `cleanPersistedState()`, `freshState()`, `cloneState()`, timestamp constants
- Removed dead `resolveProjectPath()` function from `src/shared/paths.ts`
- Unified `STALE_THRESHOLD_HOURS = 720` into CAPS constant (was hardcoded in 3 files)
- Consolidated redundant re-export in `vault-store.ts`
- Made `HindsightVaultStore` extend `NoopVaultStore` (removed duplicate no-op methods)

#### Graphify Async Migration (Complete)
- Replaced `statSync` from `node:fs` with `stat` from `node:fs/promises` in `graphify-client.ts`
- All Graphify infrastructure now fully async (`Bun.spawn`, `Bun.stat`, `fetch`)
- Updated `GRAPHIFY_CONTRACT.md` terminology: `execFile` → `Bun.spawn`

#### Cleanup
- Removed dead `MAX_PREAMBLE_CHARS` constant (token estimator was already upgraded to regex-based BPE)
- Updated stale documentation in `IMPLEMENTATION_GUIDE.md`

#### Smoke Test Improvements
- Added `real-world-developer.ts` suite: 4 mid-complex scenarios (CI debugging, refactoring, incident response, code review)
- Added `edge-cases.ts` suite: 5 boundary cases (rapid switching, long content, many beliefs, empty params, max workflow steps)
- Improved prompt quality across 8 existing suites — natural developer language instead of robotic instructions
- All new assertions use structural checks only (no LLM content matching)

#### Coverage Improvements
- New test files: `focus-resolver.test.ts` (11 tests), `focus-command.test.ts` (6 tests), `vault-detector.test.ts` (4 tests), `schema-defaults.test.ts` (15 tests), `graphify-parser-edge.test.ts` (16 tests), `graphify-setup.test.ts` (5 tests), `ranking-strategy.test.ts` (13 tests), `state-manager-checkpoint.test.ts` (4 tests)
- Augmented: `preamble-builder.test.ts` (+13), `survivor-builder.test.ts` (+4), `tools.test.ts` (+65), `filesystem-store.test.ts` (+1)
