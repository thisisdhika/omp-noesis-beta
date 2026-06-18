# Changelog

All notable changes to omp-noesis.


## [0.1.1] — 2026-06-18

### Changed — Model-Agnostic Refactor

#### Split Believe Tool (7 → 9 Canonical Tools)
- **`noesis_believe_fact`** — flat Zod schema with required `content`, `confidence`, `source`; optional `evidence`, `tags`, `contradicts`, `graphFinding`
- **`noesis_believe_decision`** — required `content`, `rationale`, `source`; optional `alternatives`, `tags`, `contradicts`
- **`noesis_believe_learning`** — required `learningId`, `rootCause`, `fix`; optional `evidence`, `tags`
- Removed `.refine()` conditional validation from all three — Zod enforces per-tool required fields directly; no cross-field reasoning needed
- Motivation: `.refine()` discriminator was the #1 small-model failure mode (DeepSeek, Mimo, Qwen parse schemas as raw text)

#### Simplified Infer & Commit Tools
- Removed `.refine()` from `noesis_infer` — all fields optional at Zod level; runtime returns clear errors on retry
- Removed `.refine()` from `noesis_commit` — same pattern; Zod is lenient, execution errors are explicit

#### Expanded Tool Descriptions
- All 9 tools now carry 4–5 sentence descriptions (what / when / when-not / consequence / alternatives)
- Critical for DeepSeek which parses schemas as raw Markdown text without structured AST

#### Provider-Aware Schema Adaptation
- **`src/shared/provider-schema.ts`** — transforms tool JSON Schemas per model family:
  - DeepSeek: removes `additionalProperties: false`
  - Mimo/Qwen/Llama: truncates descriptions to ≤200 chars
- **`src/hooks/provider-request-hook.ts`** — registered on `before_provider_request`; injects `tool_choice: "required"` for small models

#### DeepSeek Strict Mode Compatibility
- Removed `.min()` / `.max()` from all string and array Zod constraints (DeepSeek strict validation rejects on length defaults)
- All 7 canonical tool files refactored: each exports `build*Params(pi)` + `execute*(runtime, params)` + `register*Tool(pi, runtime)`

#### API Renames
- `contradictsIds` → `contradicts` (saves ~5 tokens per call)
- Aliases: 7 → 9 (`store_memory`→`noesis_believe_fact`, new `store_decision`, `store_learning`)

#### Model Family Detection
- `src/shared/model-profile.ts` — `ModelFamily`, `detectModelFamily()`, `getProfile()` with per-family profiles
- Wired into `context-hook.ts` for density control and `preamble-builder.ts` for prompt adaptation

### Fixed
- `state.attention.pendingEvidence.map` crash — added `deepMergeDefaults` utility; `StateManager.initialize()` deep-merges loaded state

### Testing
- 931 pass, 12 pre-existing failures (Obsidian + Graphify CLI) across 65 test files
- New: 31 domain strategy tests, 35 aliases tests, 18 context-hook tests, 23 provider-schema tests, 4 provider-request-hook tests

## [0.1.0] — 2026-06-15

### Changed
- **`noesis:init` user-visible output** — Replaced all `pi.logger.*` calls (file-only logger) with `pi.sendMessage()` for user-visible status messages in the chat UI. All status messages use `display: true` and `attribution: "agent"`.
- **`noesis:init` project config bootstrap** — Now writes/merges `.omp/config.yml` with recommended compaction settings (`enabled: true, strategy: context-full, autoContinue: true, thresholdTokens: 160000`). Existing config is deep-merged (preserves user keys), deprecated keys (`reserveTokens`, `keepRecentTokens`, `idleThresholdTokens`) are removed. Force mode (`--force`) overwrites entirely.
- **`noesis:init` Graphify skill awareness** — After installing the Graphify skill, sends an LLM-visible `sendMessage` with `deliverAs: "steer"` telling the agent the skill is available at `skill://graphify` for codebase-aware reasoning.
- **`noesis:init` return value** — Now returns a status string (`"initialized-full"`, `"initialized-degraded-no-cli"`, `"initialized-degraded-no-graphify"`) for programmatic callers.
- **MockPi** — Added `sendMessage()` mock and `_getMessages()` test helper.

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
- `/noesis:init` — initializes `.omp/noesis/` directory and config

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
- Augmented: `preamble-builder.test.ts` (+13), `survivor-builder.test.ts` (+4), `tools.test.ts` (+65), `filesystem-store.test.ts` (+1), `mock-pi.ts` (+15, sendMessage mock)

#### `noesis:init` Command Redesign
- Replaced `pi.logger.*` with `pi.sendMessage()` for user-visible output (logger goes to file only)
- Added `.omp/config.yml` bootstrap with deep-merged recommended compaction settings (`thresholdTokens: 160000`)
- Injects LLM-visible Graphify skill message via `sendMessage({ deliverAs: "steer" })`
- Returns status string for programmatic callers
- New test file: `init-command.test.ts` (14 tests, 56 assertions)
