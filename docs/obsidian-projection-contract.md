# omp-noesis: Obsidian Projection Contract

> Version: 1.0
> Date: 2026-06-12
> Status: Aligned

---

## 1. Purpose

This document defines how noesis optionally projects cognitive state into an Obsidian vault for human review.

It answers:
- What gets projected?
- Where in the vault does it go?
- How does it stay truly optional?
- How does it relate to Graphify's built-in Obsidian export?

---

## 2. The Optionality Rule

Obsidian is optional. This is a hard rule from the PRD and boundary matrix:

> **If Obsidian disappears, noesis still works.**

Noesis must never:
- Require an Obsidian vault to operate
- Fail or degrade without Obsidian
- Block any runtime path on Obsidian availability
- Reference Obsidian paths in the cognitive preamble by default

The projection is a one-way export: noesis → vault. Noesis never reads from the vault as part of its runtime cognition.

---

## 3. What Gets Projected

Noesis projects cognitive artifacts into the vault when they are evicted from working memory (at turn end or compaction). All artifacts use the same generic flat-file format; the `kind` field distinguishes the content type.

### 3.1 Decisions

Each evicted decision becomes a Markdown note.

**File**: `Noesis/noesis-decision-{id}.md`

**Frontmatter** (minimal — no typed schema per kind in v1):
```yaml
---
kind: decision
projectPath: <detected-from-cwd>
id: <unique-id>
pushedAt: 2026-06-12T14:00:00Z
metadata:
  status: active
  source: agent-oracle
---
```

**Body**: The decision's content text.

> **Deferred** (future): `Decisions/` subdirectory, slug-based filenames, rich typed frontmatter (type, status, confidence, source, tags, aliases, created, updated), wikilinks, alternatives/rationale section.

### 3.2 Learning entries

Resolved learning entries are projected when evicted.

**File**: `Noesis/noesis-learning-{id}.md`

**Frontmatter**:
```yaml
---
kind: learning
projectPath: <detected-from-cwd>
id: <unique-id>
pushedAt: 2026-06-12T14:15:00Z
metadata:
  description: <...>
  rootCause: <...>
  fix: <...>
---
```

**Body**: The learning entry's description text.

> **Deferred** (future): `Learning/` subdirectory, slug-based filenames, rich typed frontmatter (type, category, resolved, skill_scope, tool, tags).

### 3.3 Belief and Pattern artifacts

Belief facts and pattern artifacts (hypotheses, commitment actions) use the same generic format when evicted by the eviction pipeline.

**File**: `Noesis/noesis-belief-{id}.md` or `Noesis/noesis-pattern-{id}.md`

Minimal frontmatter identical to decisions and learning.

### 3.4 Session snapshots

**Not implemented in v1.** Periodic state snapshots for human review are deferred.

### 3.5 Index

**Not implemented in v1.** An auto-generated index note linking to all projected content is deferred.

---

## 4. Vault Structure

```
<vault-root>/
└── Noesis/                  # All projected artifacts (flat)
    ├── noesis-decision-{id}.md
    ├── noesis-learning-{id}.md
    ├── noesis-belief-{id}.md
    └── noesis-pattern-{id}.md
```

The vault root is discovered by the vault detector. It can be configured via `noesis.obsidianVaultPath` in OMP config, or auto-detected from the project's `.obsidian` directory.

Noesis never creates a vault from scratch — the developer points it at an existing vault or accepts the detected default.

> **Future**: The hierarchical layout (`Decisions/`, `Learning/`, `Sessions/`) is deferred. All files currently live flat in `Noesis/`.

---

## 5. Graphify Integration

Graphify already has built-in Obsidian export:

```bash
graphify . --obsidian
```

This creates code-structure notes in the vault (one note per code entity, with edges as wikilinks). Noesis and Graphify projections are complementary:

| Layer | Who projects | Content |
|---|---|---|
| Code structure | Graphify (`--obsidian`) | Entities, relations, communities |
| Cognitive state | Noesis | Decisions, learning, beliefs, patterns |

The two projections live in the same vault. Cross-linking via wikilinks is a future enhancement.

Noesis does not duplicate Graphify's export — it adds the cognitive layer that Graphify does not have.

---

## 6. Projection Triggers

Projection is never continuous. It happens on explicit lifecycle events:

| Trigger | What gets projected |
|---|---|
| Turn end (eviction) | Evicted beliefs, decisions, hypotheses, learning entries |
| Session compaction (eviction) | Same as turn end, plus VaultRetry flush |
| VaultRetry flush | Previously failed pushes (best-effort) |

### Anti-triggers
- Every turn: too noisy for full projection; only evicted items are pushed
- On belief changes only: beliefs alone don't warrant separate notes
- Automatically: projection is always triggered through eviction, never on arbitrary state changes

> **Note**: VaultRetry is fully implemented and wired to both turn-end and compaction hooks. Failed pushes are buffered and retried on the next compaction cycle.

---

## 7. Format Conventions

### Filename structure

All files follow the pattern `noesis-{kind}-{id}.md`, where `{id}` is a stable artifact identifier. This is independent of the artifact's content or title.

Example: `noesis-decision-a1b2c3d4.md`

> **Future**: Slug-based filenames (`use-jwt-over-session-cookies.md`) are deferred. The current id-based naming is stable and collision-free.

### Frontmatter

The frontmatter uses four fixed fields and an optional metadata block:

```
---
kind: decision
projectPath: /path/to/project
id: a1b2c3d4
pushedAt: 2026-06-12T14:00:00Z
metadata:
  status: active
  source: agent-oracle
---
```

There is no typed schema per kind in v1. Kind-specific data (status, confidence, tags, etc.) is stored in the freeform `metadata` block when the caller supplies it.

### Tags

Tags are stored inside the `metadata` block (e.g., `metadata.tags`), not as a top-level frontmatter field. Tag semantics depend on the caller.

### Wikilinks

**Not implemented in v1.** Cross-references use plain text or internal identifiers. Obsidian wikilinks (`[[Note Name]]`) are deferred.

---

## 8. Error Handling

Projection errors must never affect runtime cognition.

| Scenario | Behavior |
|---|---|
| Vault path doesn't exist | Artifact is buffered to VaultRetry; logged |
| Vault path not writable | Artifact is buffered to VaultRetry; logged |
| Disk full | Artifact is buffered to VaultRetry; logged |
| Frontmatter parse error (on pull) | Skip that artifact, continue others |

Failed pushes are caught and enqueued in VaultRetry. On the next compaction cycle, VaultRetry flushes the buffer — previously failed artifacts are re-pushed in order. If a re-push fails, the remaining buffer is preserved for the next cycle.

> **Note**: `validate()` is implemented on ObsidianVaultStore but is NOT called before `push()`. The push call itself fails and the artifact goes to VaultRetry. Pre-write validation is a future hardening opportunity.

---

## 9. What Noesis Never Does

| Anti-pattern | Why |
|---|---|
| Read from the Obsidian vault during runtime | Obsidian is output-only; Mnemopi/Hindsight handle memory |
| Require Obsidian for correctness | Hard rule from PRD and boundary matrix |
| Create its own note editor or viewer | Obsidian already does this |
| Index or search the vault | Obsidian has built-in search and graph view |
| Auto-sync continuously | Projection is triggered, not streaming |
| Replace Graphify's `--obsidian` export | Graphify owns code structure; noesis adds cognition |
| Build a custom graph view | Obsidian's graph view already handles wikilink graphs |

---

## 10. Relationship to Mnemopi and Hindsight

Noesis's Obsidian projection is distinct from OMP's memory systems:

| System | Role | Format | Direction |
|---|---|---|---|
| **Mnemopi** | Cross-session long-term memory | SQLite / internal | Read/write at runtime |
| **Hindsight** | Session reflection and summaries | Internal | Read/write at runtime |
| **Noesis Obsidian** | Human-reviewable cognitive projection | Markdown vault | Write-only export |

Noesis does not compete with Mnemopi or Hindsight. It provides a different surface: human-readable, linkable, browsable, curated. Mnemopi is for the agent; Obsidian projection is for the human.

---

## 11. Configuration

```jsonc
// .omp/noesis/config.json (future)
{
  "obsidian": {
    "enabled": false,           // default: off
    "vaultPath": ".obsidian/noesis/",  // or path to existing vault
    "projectDecisions": true,
    "projectLearning": true,
    "projectSessions": true,
    "autoIndex": true
  }
}
```

All options default to off. The developer opts in.

---

## 12. Design Rules

1. **Projection is write-only.** Noesis never reads from the vault for cognition.
2. **Projection is best-effort.** Failures are logged, never propagated.
3. **Never runtime-critical.** Removing the vault must not affect agent behavior.
4. **One-way enrichment.** Noesis → vault. Never vault → noesis.
5. **Human surface, not agent surface.** The vault is for review, not for reasoning.
6. **Complement Graphify, don't compete.** Graphify owns code structure; noesis adds cognition.

---

## 13. v1 Scope vs Future Enhancements

This table documents what is implemented in the current v1 and what is deferred to future iterations.

| Feature | v1 Status | Notes |
|---|---|---|
| Decision projection | ✅ Implemented | Flat `Noesis/` dir, minimal frontmatter, id-based filename |
| Learning projection | ✅ Implemented | Same flat structure |
| Belief and pattern projection | ✅ Implemented | Side effect of eviction pipeline |
| VaultStore interface + NoopVaultStore | ✅ Implemented | Backend abstraction |
| Backend detection (vault-detector) | ✅ Implemented | Configurable resolution order |
| VaultRetry retry buffer | ✅ Implemented | Wired in turn-end and compaction hooks |
| `validate()` method | ✅ Implemented | Defined but NOT called before `push()` |
| `pull()` / `search()` | ✅ Implemented | Session-start enrichment and vault-search tool |
| `Decisions/`, `Learning/`, `Sessions/` subdirectory layout | ❌ Deferred | Flat `Noesis/` only |
| Rich typed frontmatter per kind | ❌ Deferred | Minimal generic frontmatter |
| Index.md auto-generation | ❌ Deferred | |
| Session snapshots | ❌ Deferred | |
| Wikilinks and cross-references | ❌ Deferred | |
| Slug-based filenames | ❌ Deferred | Uses `noesis-{kind}-{id}.md` |
| Pre-write validation (validate() before push()) | ❌ Deferred | validate() exists but not wired |

---

## 14. References

Internal grounding:
- `docs/PRD.md` (§4.2: Obsidian optional, §12.5: projection layer)
- `docs/boundary-matrix.md` (§6.4: Obsidian owns optional reflection)
- `docs/cognitive-state-schema.md` (BeliefDecision, LearningEntry)
- `docs/research/04-graphify-labs.md` (§6: Obsidian export)
- `docs/stale/omp-noesis-strategic-blueprint.md` (noesis-vault concept, frontmatter schema)

External grounding:
- Obsidian: https://obsidian.md/
- Obsidian help (data storage): https://obsidian.md/help/data-storage
- Graphify Obsidian export: https://github.com/safishamsi/graphify
- llm-wiki (AI-maintained Obsidian wiki): https://github.com/enduserlab/llm-wiki
- obra/knowledge-graph (Obsidian vault as graph): https://github.com/obra/knowledge-graph

---

## 15. Vault Store Contract

### 15.1 `VaultStore` Interface

File: `src/vault/vault-store.ts`

The `VaultStore` interface is the memory abstraction layer. Every backend implements it so Noesis never branches on which vault is active.

| Method | Signature | Behavior |
|--------|-----------|----------|
| `push` | `(artifact: VaultArtifact) => Promise<void>` | Fire-and-forget persistence; errors go to retry buffer |
| `pull` | `(projectPath, options) => Promise<VaultPullResult>` | Read artifacts for session-start enrichment, capped per kind |
| `search` | `(query, projectPath, maxResults) => Promise<VaultArtifact[]>` | Natural-language search across vault artifacts |
| `validate` | `() => Promise<boolean>` | Health check (reachable / functional) |

### 15.2 NoopVaultStore

File: `src/vault/noop-vault-store.ts`

Accepts every push, returns empty results on pull/search, always validates as healthy. This is the Obsidian-optionality enforcement mechanism: callers never guard on vault availability.

### 15.3 VaultDetector

File: `src/vault/vault-detector.ts`

`detectVault(root)` resolves the active backend through a priority chain:

1. **Project config** — `noesis.obsidianVaultPath` → `ObsidianVaultStore`
2. **`.obsidian/` directory** — exists at project root → `ObsidianVaultStore`
3. **OMP memory backend** — `settings.memory.backend` → `local`, `mnemopi`, or `hindsight`
4. **Fallback** — `NoopVaultStore` (equivalent to `memory.backend: off`)

Returns `{ store: VaultStore; label: string }` for preamble diagnostics.

### 15.4 VaultRetry

File: `src/vault/vault-retry.ts`

On-disk retry buffer stored at `.omp/noesis/vault-retry.json`.

- `enqueue(artifact)`: buffers a failed push to disk
- `flush(store)`: replays all buffered artifacts through the given store in order; stops on first failure
- On flush success (empty queue), the retry file is deleted
- Loaded from disk on construction, so buffered artifacts survive process restarts

### 15.5 ObsidianVaultStore

File: `src/vault/obsidian-vault-store.ts`

Persists artifacts as Markdown files with YAML frontmatter under `<vault-root>/Noesis/noesis-<kind>-<id>.md`. Reads artifacts by scanning the `Noesis/` directory; frontmatter fields (`kind`, `projectPath`, `id`, `pushedAt`, `metadata`) are parsed back into `VaultArtifact` structs.

Search uses simple substring matching: frontmatter field hits score highest, metadata value matches score medium, content body occurrence frequency scores lowest.

### 15.6 ObsidianMerger

File: `src/vault/obsidian-merger.ts`

`mergeVaultPull(state, artifacts)` merges pulled vault artifacts into in-memory cognitive state. Conflict rules:

| Scenario | Resolution |
|----------|------------|
| Decision not in state | Import (vault wins) |
| Decision exists, vault `pushedAt` newer | Vault wins, patch in place |
| Decision exists, vault `pushedAt` older | State wins, record conflict |
| Belief not in state | Import, confidence capped at 0.80 (vault trust discount) |
| Belief exists in state | Preserve state (no overwrite) |
| Resolved learning not in state | Import as success entry |
| Learning exists in state | Skip |
| Pattern artifact | Skipped (separate pipeline) |

### 15.7 LocalVaultStore

File: `src/vault/local-vault-store.ts`

Append-only persistence to `MEMORY.md`. Each push appends a `## <kind>:<id>` header followed by JSON-like body lines. Pull re-reads the file filtering by project tag. Search greps line-by-line. Simplest dev fallback, no dependencies.

### 15.8 MnemopiVaultStore

File: `src/vault/mnemopi-vault-store.ts`

SQLite-backed store at `.omp/noesis/mnemopi.sqlite` (WAL mode). Uses `Bun.sqlite` with a `vault_artifacts` table. Provides structured querying via SQL as a dev-mode alternative to Obsidian or Hindsight.

### 15.9 HindsightVaultStore

File: `src/vault/hindsight-vault-store.ts`

Remote API-backed store using Hindsight — a hosted semantic-memory service. Pushes artifacts as structured memories via POST, recalls via GET, validates connectivity via `/health`. Configured via `noesis.hindsight.apiUrl` / `noesis.hindsight.apiToken` in OMP config, or `HINDSIGHT_API_URL` / `HINDSIGHT_API_TOKEN` environment variables. Falls back to `http://localhost:3040` with empty token.

---

## 16. Obsidian Writer

File: `src/infrastructure/obsidian-writer.ts`

`writeObsidianNote(vaultPath, note)` performs atomic file writes (temp → fsync → rename) for three note types:

- `decision` → `Decisions/<slug>.md`
- `learning` → `Learning/<slug>.md`
- `session` → `Sessions/<slug>.md`

Builds YAML frontmatter with `type`, `status`, and arbitrary metadata from `note.frontmatter`. Slugs are derived from the title (lowercased, non-alphanumeric → `-`, max 48 chars). On failure, logs a warning and cleans up temp files — never throws.

---

## References continued

Vault backends:
- `src/vault/vault-store.ts` — VaultStore interface
- `src/vault/noop-vault-store.ts` — NoopVaultStore
- `src/vault/obsidian-vault-store.ts` — ObsidianVaultStore
- `src/vault/obsidian-merger.ts` — mergeVaultPull
- `src/vault/vault-detector.ts` — detectVault
- `src/vault/vault-retry.ts` — VaultRetry
- `src/vault/local-vault-store.ts` — LocalVaultStore
- `src/vault/mnemopi-vault-store.ts` — MnemopiVaultStore
- `src/vault/hindsight-vault-store.ts` — HindsightVaultStore
