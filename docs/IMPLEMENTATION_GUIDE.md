# omp-noesis: Implementation Guide

> **Version:** 0.1.0  
> **Date:** 2026-06-15  
> **Status:** Finalized

## Phase 0: Foundation (Week 1)

### Day 1: Project Setup
```bash
mkdir omp-noesis
cd omp-noesis
bun init
# Edit package.json with omp.extensions field
# Edit tsconfig.json with strict settings
```

**Deliverable:** Buildable project skeleton

### Day 2: Schema Definition
```
src/schema.ts
```
- Define all Zod schemas
- Export TypeScript interfaces
- Create EMPTY_STATE factory
- Add ID generation utility

**Deliverable:** Type-safe foundation

### Day 3: Shared Utilities
```
src/shared/
  ids.ts      — UUID v4 generation
  time.ts     — ISO 8601 helpers
  tokens.ts   — Token estimation (regex-based approximate BPE)
  text.ts     — Truncation, XML escaping
  paths.ts    — Project path resolution
  clone.ts    — Deep clone for immutable state
```

**Deliverable:** Helper library

### Day 4: Persistence Layer
```
src/infrastructure/
  filesystem-store.ts   — Atomic read/write
  migrations.ts       — Schema migration pipeline
```

**Deliverable:** Atomic persistence

### Day 5: State Manager
```
src/infrastructure/state-manager.ts
```
- `read()`: Readonly state access
- `mutate()`: Synchronous mutation + persist
- `checkpointAttention()`: Lazy attention persist
- `invalidate()`: Force reload from disk

**Deliverable:** In-memory authority

**Acceptance:** `bun test tests/unit/shared` passes. State file round-trips correctly.

## Phase 1: Core Domains (Week 2)

### Day 6: Attention Domain
```
src/domains/attention/attention-domain.ts
```
- `setFocus()`, `setGraphQueries()`, `setFiles()`
- `storeGraphFindings()`, `clearGraphFindings()`

### Day 7-8: Belief Domain
```
src/domains/belief/
  belief-domain.ts        — addFact, addDecision, getActiveFacts/Decisions
  revision-strategy.ts    — AGM supersession
  confidence-strategy.ts  — translateGraphConfidence, applyStalePenalty
```

### Day 9: Inference Domain
```
src/domains/inference/inference-domain.ts
```
- `addHypothesis()`, `confirmHypothesis()`, `getUnresolvedHypotheses()`

### Day 10: Commitment Domain
```
src/domains/commitment/
  commitment-domain.ts    — extendWorkflow, replaceWorkflow, updateWorkflowStatus
  consistency-strategy.ts — checkConsistency()
```

### Day 11: Learning Domain
```
src/domains/learning/
  learning-domain.ts      — addLearning, getRankedLearning, applyRetentionPolicy
  ranking-strategy.ts     — rankLearning() scoring
  eviction-strategy.ts    — Eviction logic
```

### Day 12: Unit Tests
```
tests/unit/
  belief/
    revision-strategy.test.ts
    confidence-strategy.test.ts
  learning/
    ranking-strategy.test.ts
    eviction-strategy.test.ts
  commitment/
    consistency-strategy.test.ts
```

**Acceptance:** All unit tests pass. AGM revision verified with property tests.

## Phase 2: Rendering (Week 3)

### Day 13: Preamble Builder
```
src/rendering/preamble-builder.ts
```
- Fixed section order
- Per-section caps
- Token trimming (whole-section drop)
- XML escaping

### Day 14: Survivor Builder
```
src/rendering/survivor-builder.ts
```
- Select survivor subset
- Format `<noesis-state>` payload
- Inject state file pointer

### Day 15: Section Formatters
```
src/rendering/section-formatters.ts
```
- Per-section Markdown formatters
- Capability block
- Graph evidence section
- Low-confidence signal section

### Day 16: Focus Resolver
```
src/rendering/focus-resolver.ts
```
- Explicit attend override
- Workflow-derived fallback
- Carry-forward fallback
- Minimal default

### Day 17: State Cleanup
```
src/rendering/state-cleanup.ts
```
- `evictStale()` — remove non-active items
- `evictOverCap()` — trim lowest-ranked items

### Day 18-19: Graphify Integration
```
src/infrastructure/
  graphify-client.ts    — Subprocess + MCP fallback
  graphify-parser.ts    — NL → structured
  graphify-engine.ts    — Confidence mapping
```

**Acceptance:** Preamble never exceeds 2000 tokens. Survivor set includes all required categories.

## Phase 3: Tools & Hooks (Week 4)

### Day 20-21: Attention Tools
```
src/tools/
  attend-tool.ts   — noesis_attend
  focus-tool.ts    — noesis_focus
```

### Day 22: Belief Tool
```
src/tools/believe-tool.ts
```
### Day 23: Inference Tool
```
src/tools/infer-tool.ts
```

### Day 24: Commitment Tool
```
src/tools/commit-tool.ts
```

### Day 25: Read Tools
```
src/tools/
  recall-tool.ts          — noesis_recall
  vault-search-tool.ts    — noesis_vault_search
```

### Day 26-27: Preamble Hooks
```
src/hooks/
  context-hook.ts                   — Sole live preamble injector
  before-agent-start-hook.ts        — Minimal safety-net
```

### Day 28: Compaction & Turn Hooks
```
src/hooks/
  compaction-hook.ts     — Survivor + preserveData
  tool-result-hook.ts    — Learning capture
  turn-end-hook.ts       — Eviction + vault flush
```

**Acceptance:** All integration tests pass. Double-preamble prevention verified.

## Phase 4: Vault & Projection (Week 5)

### Day 29-30: Vault Abstraction
```
src/vault/
  vault-store.ts        — Interface
  noop-vault-store.ts   — No-op fallback
  vault-detector.ts     — Backend resolution
```

### Day 31-32: Obsidian Backend
```
src/vault/
  obsidian-vault-store.ts  — Markdown + frontmatter
  obsidian-merger.ts       — Conflict resolution
  obsidian-writer.ts       — Atomic file write
```

### Day 33: Retry Buffer
```
src/vault/vault-retry.ts
```

### Day 34: Alternative Backends
```
src/vault/
  local-vault-store.ts     — MEMORY.md
  mnemopi-vault-store.ts  — Bun.sqlite
  hindsight-vault-store.ts — Hindsight API
```

**Acceptance:** Vault projection is best-effort and never blocks tool success.

## Phase 5: Skills & System Prompt (Week 6)

### Day 35-39: Skill Suite
```
skills/
  noesis/SKILL.md
  noesis/references/belief-patterns.md
  noesis/references/learning-patterns.md
  noesis/references/graphify-patterns.md
  noesis-belief/SKILL.md
  noesis-learning/SKILL.md
  noesis-workflow/SKILL.md
  noesis-graphify/SKILL.md
```

> Note: APPEND_SYSTEM.md lives at project root, not under `skills/`. It is referenced directly by `context-hook.ts`.

### Day 40: System Prompt Integration
```
src/hooks/context-hook.ts
```
- Inject APPEND_SYSTEM content into preamble

### Day 41: Behavioral Tests
```
tests/behavioral/
  compaction-survival.test.ts
  learning-loop.test.ts
  graphify-grounding.test.ts
  belief-revision.test.ts
  smart-zone.test.ts
  graceful-degradation.test.ts
  skill-effectiveness.test.ts
```

**Acceptance:** Agent with skills uses noesis tools correctly.

## Phase 6: Polish & Ship (Week 7)

### Day 42: Init Command
```
src/commands/init-command.ts
```

### Day 43: Documentation
```
README.md
SETUP.md
TROUBLESHOOTING.md
```

### Day 44-45: Security Audit
```
# Check for shell injection, path traversal
```

### Day 46: Release
```
bun test --coverage
git tag v0.1.0
```

**Acceptance:** All ~507 tests pass.
