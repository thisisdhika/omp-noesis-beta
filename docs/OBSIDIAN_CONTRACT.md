# Obsidian Projection Contract

> **Version:** 1.0.1 | **Updated:** 2026-06-24

## Optionality Rule

> If Obsidian disappears, Noesis still works.

Noesis must never:
- Require an Obsidian vault to operate
- Fail or degrade without Obsidian
- Block any runtime path on Obsidian availability

| Artifact | Path | Format |
|---|---|---|
| Decisions | `.obsidian/noesis/decision/{id}.md` | Frontmatter + body |
| Learning entries | `.obsidian/noesis/learning/{id}.md` | Frontmatter + body |
| Belief artifacts | `.obsidian/noesis/belief/{id}.md` | Frontmatter + body |
| Pattern artifacts | `.obsidian/noesis/pattern/{id}.md` | Frontmatter + body |
| Session artifacts | `.obsidian/noesis/session/{id}.md` | Frontmatter + body |

### Vault Structure

```
<vault-root>/.obsidian/noesis/
  ├── _INDEX.md          (Bases queries, generated on flush)
  ├── decision/
  ├── learning/
  ├── belief/
  ├── pattern/
  └── session/
```

## Frontmatter Format Specification

Each projected note uses standard YAML frontmatter with the following structure:

```yaml
---
kind: belief                          # artifact kind (belief|decision|learning|pattern|session)
id: bf-29a1b390-ac44-4ad9-80fa-27a04e77948b
pushedAt: "2026-06-24T04:48:14.336Z" # ISO 8601
projectPath: /path/to/project
tags: [noesis, noesis/belief]         # Always present: [noesis, noesis/{kind}]
status: active                        # active|superseded|archived
source: execution                     # graph|execution|user|inference|omp-memory|obsidian-import
confidence: 0.75                      # 0.0 - 1.0 (omitted for decisions/patterns/sessions)
metadata:                             # kind-specific fields (evidence, rationale, alternatives)
  evidence: "verified via test run"
---
```

### Field Changes (v1.0)

| Field | Location | Change |
|---|---|---|
| `tags` | Top-level | **New** — enables Obsidian graph/search |
| `status` | Top-level | **New** — mirrors state.json lifecycle |
| `source` | Top-level | **Promoted** from metadata block |
| `confidence` | Top-level | **Promoted** from metadata block |
| `metadata` | Nested | Now contains only kind-specific fields (evidence, rationale, alternatives) |

## Projection Triggers

| Trigger | What gets projected |
|---|---|
| Turn end (`turn-end-hook`) | Retry buffer flush |
| New artifact push | Individual decision/learning/belief/pattern |
| `VaultRetry.flush()` | Previously failed pushes |

Compaction does NOT project to vault. Only direct tool calls and turn-end retry flushing write to vault paths.

## Error Handling

| Scenario | Behavior |
|---|---|
| Path doesn't exist | Buffer to VaultRetry, log |
| Path not writable | Buffer to VaultRetry, log |
| Disk full | Buffer to VaultRetry, log |
| Frontmatter parse error | Skip artifact, continue others |

## What Noesis Never Does

- Read from Obsidian vault for cognition (vault reads use OMP memory — never Obsidian)
- Require Obsidian for correctness
- Create its own note editor or viewer
- Auto-sync continuously
- Replace Graphify's `--obsidian` export

## Relationship to Storage Layers

| System | Role | Direction |
|---|---|---|
| **OMP Memory** | Cross-session durability (memory backend) | Read/write via retainToOmp + searchFromOmp |
| **state.json** | Cognitive state authority (`.omp/noesis/state.json`) | Read/write — always authoritative |
| **Obsidian vault** | Human-reviewable projection (Markdown) | Write-only — best-effort |

## Auto-Detection

At startup, `vault-detector.ts` resolves whether an Obsidian vault is available:

- **Memory backend** (always available): OMP memory backend (`.omp/`) — primary cross-session channel
- **Projection backend** (optional): obsidian (`.obsidian/`) or none
- Obsidian projection is best-effort — `NoopVaultStore` is the fallback when no vault is detected

## Design Rules

1. Projection is write-only — Noesis never reads vault for cognition
2. Best-effort — failures logged, never propagated
3. Never runtime-critical — removing vault doesn't affect behavior
4. One-way enrichment: Noesis → vault, never reverse
5. Human surface, not agent surface
6. Graphify owns code structure; Noesis adds cognition
